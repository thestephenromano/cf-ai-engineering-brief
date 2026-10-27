import { readFileSync, readdirSync } from "node:fs";
import { resolve, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { parse } from "yaml";

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

export function sourcePaths(root) {
  return readdirSync(resolve(root, "src"), {
    recursive: true,
    withFileTypes: true,
  })
    .filter((entry) => entry.isFile())
    .map((entry) =>
      relative(root, resolve(entry.parentPath, entry.name)).replaceAll(
        "\\",
        "/",
      ),
    )
    .sort();
}

export function validateLedger(matrix, register, paths) {
  requireCondition(
    matrix.schema === "assay-conformance-matrix/1",
    "Unknown matrix schema",
  );
  requireCondition(
    matrix.claimed_level === null,
    "This exercise has no demonstrated forge conformance level",
  );
  requireCondition(
    Array.isArray(matrix.paths) && matrix.paths.length > 0 && paths.length > 0,
    "Empty path inventory",
  );
  const actual = matrix.paths.map((row) => row.path).sort();
  requireCondition(
    JSON.stringify(actual) === JSON.stringify([...paths].sort()),
    "Production path inventory does not reconcile",
  );
  const gates = Array.from(
    { length: 15 },
    (_, index) => `G${index + 1}`,
  ).sort();
  for (const row of matrix.paths) {
    requireCondition(
      row.verified === false,
      `Unestablished full verification claim: ${row.path}`,
    );
    requireCondition(
      JSON.stringify(Object.keys(row.gates).sort()) === JSON.stringify(gates),
      `Incomplete gate inventory: ${row.path}`,
    );
    for (const gate of gates) {
      requireCondition(
        ["local_pass", "not_measured", "n/a"].includes(row.gates[gate]),
        `Unknown status: ${gate}`,
      );
      requireCondition(
        typeof row.notes[gate] === "string" &&
          row.notes[gate].trim().length > 0,
        `Missing evidence/reason: ${gate}`,
      );
    }
  }
  requireCondition(
    register.schema === "assay-findings-register/1" &&
      Array.isArray(register.findings),
    "Invalid findings schema",
  );
  const ids = new Set();
  for (const finding of register.findings) {
    requireCondition(
      /^BRIEF-\d{3}$/.test(finding.id) && !ids.has(finding.id),
      "Invalid or duplicate finding ID",
    );
    ids.add(finding.id);
    requireCondition(
      typeof finding.description === "string" && finding.description.length > 0,
      "Missing finding description",
    );
    requireCondition(
      finding.status === "open" || finding.status === "closed",
      "Unknown finding status",
    );
    if (finding.status === "closed") {
      requireCondition(
        /^[a-f0-9]{40}$/.test(finding.closure?.commit ?? "") &&
          Boolean(finding.closure?.measurement),
        "Closure needs commit identity and measurement",
      );
    } else
      requireCondition(
        Boolean(finding.retirement_condition),
        "Open finding needs a retirement condition",
      );
  }
}

export function validateWorkflows(ci, deploy) {
  requireCondition(
    ci.permissions?.contents === "read" &&
      deploy.permissions?.contents === "read",
    "Workflows need read-only repository permissions",
  );
  requireCondition(
    ci.on?.pull_request !== undefined &&
      ci.on?.push &&
      ci.on?.workflow_call !== undefined &&
      ci.on?.schedule?.length > 0,
    "CI trigger inventory is incomplete",
  );
  for (const name of ["check", "test", "assurance"]) {
    const job = ci.jobs?.[name];
    requireCondition(
      job?.steps?.length > 0 && job["timeout-minutes"] > 0,
      `Missing bounded CI job: ${name}`,
    );
  }
  requireCondition(
    Object.keys(deploy.on).length === 1 && "workflow_dispatch" in deploy.on,
    "Deployment must be explicitly initiated",
  );
  requireCondition(
    deploy.jobs?.verify?.uses === "./.github/workflows/ci.yml" &&
      deploy.jobs.verify.if === "github.ref == 'refs/heads/main'",
    "Deployment must verify main through CI",
  );
  requireCondition(
    deploy.jobs?.deploy?.needs === "verify" &&
      deploy.jobs.deploy.environment === "production",
    "Deployment must wait for CI and the production environment",
  );
  for (const workflow of [ci, deploy])
    for (const job of Object.values(workflow.jobs))
      for (const step of job.steps ?? []) {
        if (step.uses)
          requireCondition(
            /^actions\/[a-z-]+@[a-f0-9]{40}$/.test(step.uses),
            "External actions must be pinned to a commit",
          );
        requireCondition(
          !step["continue-on-error"],
          "Required gates cannot ignore failure",
        );
      }
}

export function run(root, stdout = console.log, stderr = console.error) {
  try {
    const matrix = JSON.parse(
      readFileSync(
        resolve(root, "docs/validation/conformance-matrix.json"),
        "utf8",
      ),
    );
    const register = JSON.parse(
      readFileSync(
        resolve(root, "docs/validation/findings-register.json"),
        "utf8",
      ),
    );
    validateLedger(matrix, register, sourcePaths(root));
    const ci = parse(
      readFileSync(resolve(root, ".github/workflows/ci.yml"), "utf8"),
    );
    const deploy = parse(
      readFileSync(resolve(root, ".github/workflows/deploy.yml"), "utf8"),
    );
    validateWorkflows(ci, deploy);
    stdout(
      "Evidence inventory and workflow structure checked; no Assay level asserted.",
    );
    return 0;
  } catch (error) {
    stderr(error instanceof Error ? error.message : String(error));
    return error?.code === "ENOENT" ? 2 : 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const args = process.argv.slice(2);
  if (args.includes("--help"))
    console.log(
      "Usage: node scripts/check-evidence.mjs [--] [project-root]\nExit 0: valid; 1: rejected; 2: required input missing.",
    );
  else if (args.includes("--version")) console.log("brief-evidence 1.0.0");
  else {
    const positional = args.filter((arg) => arg !== "--");
    if (positional.length > 1 || positional.some((arg) => arg.startsWith("--")))
      process.exitCode = 2;
    else process.exitCode = run(resolve(positional[0] ?? "."));
  }
}
