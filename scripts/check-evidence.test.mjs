import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { parse } from "yaml";
import { run, validateLedger, validateWorkflows } from "./check-evidence.mjs";

function fixture() {
  const gates = Object.fromEntries(
    Array.from({ length: 15 }, (_, index) => [`G${index + 1}`, "not_measured"]),
  );
  return {
    matrix: {
      schema: "assay-conformance-matrix/1",
      claimed_level: null,
      paths: [
        {
          path: "src/example.ts",
          verified: false,
          gates,
          notes: Object.fromEntries(
            Object.keys(gates).map((gate) => [
              gate,
              "Not measured in this fixture",
            ]),
          ),
        },
      ],
    },
    register: { schema: "assay-findings-register/1", findings: [] },
  };
}

test("valid evidence passes; missing, degenerate and mismatched inventories refuse", () => {
  const { matrix, register } = fixture();
  assert.doesNotThrow(() =>
    validateLedger(matrix, register, ["src/example.ts"]),
  );
  assert.throws(() => validateLedger(matrix, register, []), /Empty/);
  assert.throws(
    () => validateLedger(matrix, register, ["src/another.ts"]),
    /reconcile/,
  );
  delete matrix.paths[0].gates.G5;
  assert.throws(
    () => validateLedger(matrix, register, ["src/example.ts"]),
    /gate inventory/,
  );
});

test("unmeasured gates cannot silently become an overall verification claim", () => {
  const { matrix, register } = fixture();
  matrix.paths[0].verified = true;
  assert.throws(
    () => validateLedger(matrix, register, ["src/example.ts"]),
    /verification claim/,
  );
  matrix.paths[0].verified = false;
  matrix.paths[0].gates.G5 = "skip";
  assert.throws(
    () => validateLedger(matrix, register, ["src/example.ts"]),
    /Unknown status/,
  );
});

test("finding closure requires both commit and measurement", () => {
  const { matrix, register } = fixture();
  register.findings.push({
    id: "BRIEF-001",
    status: "closed",
    description: "A fixture",
  });
  assert.throws(
    () => validateLedger(matrix, register, ["src/example.ts"]),
    /Closure/,
  );
  register.findings[0].closure = {
    commit: "a".repeat(40),
    measurement: "A focused witness passed.",
  };
  assert.doesNotThrow(() =>
    validateLedger(matrix, register, ["src/example.ts"]),
  );
});

test("actual CLI distinguishes unavailable input (2), rejection (1), and acceptance (0)", () => {
  const root = mkdtempSync(join(tmpdir(), "brief-gate-"));
  try {
    const quiet = () => {};
    assert.equal(run(root, quiet, quiet), 2);
    mkdirSync(join(root, "docs/validation"), { recursive: true });
    mkdirSync(join(root, "src"));
    mkdirSync(join(root, ".github/workflows"), { recursive: true });
    writeFileSync(join(root, "src/example.ts"), "export const example = 1;\n");
    const { matrix, register } = fixture();
    writeFileSync(
      join(root, "docs/validation/conformance-matrix.json"),
      JSON.stringify(matrix),
    );
    writeFileSync(
      join(root, "docs/validation/findings-register.json"),
      JSON.stringify(register),
    );
    for (const name of ["ci", "deploy"])
      writeFileSync(
        join(root, `.github/workflows/${name}.yml`),
        readFileSync(
          new URL(`../.github/workflows/${name}.yml`, import.meta.url),
        ),
      );
    const script = new URL("./check-evidence.mjs", import.meta.url);
    const exec = () =>
      spawnSync(process.execPath, [script.pathname, root], { timeout: 5000 });
    assert.equal(exec().status, 0);
    matrix.paths = [];
    writeFileSync(
      join(root, "docs/validation/conformance-matrix.json"),
      JSON.stringify(matrix),
    );
    assert.equal(exec().status, 1);
    rmSync(join(root, "docs/validation/conformance-matrix.json"));
    assert.equal(exec().status, 2);
    assert.equal(
      spawnSync(process.execPath, [script.pathname, "--nonsense", "--help"])
        .status,
      0,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("workflow structure accepts the real pipelines and refuses unsafe deployment wiring", () => {
  const ci = parse(
    readFileSync(
      new URL("../.github/workflows/ci.yml", import.meta.url),
      "utf8",
    ),
  );
  const deploy = parse(
    readFileSync(
      new URL("../.github/workflows/deploy.yml", import.meta.url),
      "utf8",
    ),
  );
  assert.doesNotThrow(() => validateWorkflows(ci, deploy));
  const broken = structuredClone(deploy);
  broken.jobs.deploy.needs = "nothing";
  assert.throws(() => validateWorkflows(ci, broken), /wait for CI/);
  const unpinned = structuredClone(ci);
  unpinned.jobs.check.steps[0].uses = "actions/checkout@main";
  assert.throws(() => validateWorkflows(unpinned, deploy), /pinned/);
});
