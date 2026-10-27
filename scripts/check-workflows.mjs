import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

export const VERSION = "1.7.12";
const checksums = {
  darwin_arm64:
    "aba9ced2dee8d27fecca3dc7feb1a7f9a52caefa1eb46f3271ea66b6e0e6953f",
  darwin_amd64:
    "5b44c3bc2255115c9b69e30efc0fecdf498fdb63c5d58e17084fd5f16324c644",
  linux_amd64:
    "8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8",
  linux_arm64:
    "325e971b6ba9bfa504672e29be93c24981eeb1c07576d730e9f7c8805afff0c6",
};

export function verifyDownload(bytes, expected) {
  if (createHash("sha256").update(bytes).digest("hex") !== expected)
    throw new Error("actionlint archive checksum mismatch");
}

export async function checkWorkflows() {
  const platform = `${process.platform}_${process.arch === "x64" ? "amd64" : process.arch}`;
  if (!checksums[platform])
    throw new Error(`Unsupported actionlint host: ${platform}`);
  const directory = mkdtempSync(join(tmpdir(), "brief-actionlint-"));
  try {
    const archive = `actionlint_${VERSION}_${platform}.tar.gz`;
    const response = await fetch(
      `https://github.com/rhysd/actionlint/releases/download/v${VERSION}/${archive}`,
      { signal: AbortSignal.timeout(20_000) },
    );
    if (!response.ok)
      throw new Error(`actionlint download failed: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    verifyDownload(bytes, checksums[platform]);
    writeFileSync(join(directory, archive), bytes);
    const unpack = spawnSync(
      "tar",
      ["-xzf", join(directory, archive), "-C", directory, "actionlint"],
      { timeout: 20_000, stdio: "inherit" },
    );
    if (unpack.status !== 0)
      throw new Error("Could not unpack verified actionlint archive");
    const result = spawnSync(
      join(directory, "actionlint"),
      [
        "-shellcheck=",
        "-pyflakes=",
        ".github/workflows/ci.yml",
        ".github/workflows/deploy.yml",
      ],
      { timeout: 20_000, stdio: "inherit" },
    );
    if (result.error || result.signal || result.status === null)
      throw new Error("actionlint could not complete within its budget");
    return result.status;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  if (process.argv.includes("--help"))
    console.log(
      "Usage: node scripts/check-workflows.mjs\nDownloads checksum-pinned actionlint; exit 1 means rejected, 2 means unavailable.",
    );
  else if (process.argv.includes("--version"))
    console.log(`actionlint ${VERSION}`);
  else {
    try {
      process.exitCode = await checkWorkflows();
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 2;
    }
  }
}
