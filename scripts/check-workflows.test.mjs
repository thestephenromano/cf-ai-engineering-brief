import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyDownload } from "./check-workflows.mjs";

test("workflow linter installer accepts a known digest and refuses changed bytes", () => {
  // Standard SHA-256 vector for the three-byte ASCII message abc.
  const digest =
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
  assert.doesNotThrow(() =>
    verifyDownload(new TextEncoder().encode("abc"), digest),
  );
  assert.throws(
    () => verifyDownload(new TextEncoder().encode("abd"), digest),
    /checksum mismatch/,
  );
});
