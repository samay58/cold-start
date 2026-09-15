import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { fileSizeReport, lineCount } from "./check-file-size";

function repo(files: Record<string, number>) {
  const root = mkdtempSync(join(tmpdir(), "file-size-"));
  for (const [path, lines] of Object.entries(files)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), "x\n".repeat(lines));
  }
  return root;
}

describe("check-file-size", () => {
  it("counts newlines the way wc -l does", () => {
    assert.equal(lineCount("a\nb\n"), 2);
    assert.equal(lineCount("a\nb"), 1);
    assert.equal(lineCount(""), 0);
  });

  it("reports a source file over the limit and ignores tests and allowlisted files", () => {
    const root = repo({
      "packages/x/src/big.ts": 12,
      "packages/x/src/big.test.ts": 12,
      "packages/x/src/allowed.ts": 12,
      "packages/x/src/small.ts": 3
    });
    const report = fileSizeReport(root, { limit: 10, allowlist: new Set(["packages/x/src/allowed.ts"]) });
    assert.deepEqual(report.oversized, [{ path: "packages/x/src/big.ts", lines: 12 }]);
    assert.deepEqual(report.staleAllowlist, []);
  });

  it("fails an allowlist entry once its file drops under the limit or disappears", () => {
    const root = repo({ "packages/x/src/split.ts": 4 });
    const report = fileSizeReport(root, { limit: 10, allowlist: new Set(["packages/x/src/split.ts", "packages/x/src/gone.ts"]) });
    assert.deepEqual(report.oversized, []);
    assert.deepEqual(report.staleAllowlist, ["packages/x/src/gone.ts", "packages/x/src/split.ts"]);
  });
});
