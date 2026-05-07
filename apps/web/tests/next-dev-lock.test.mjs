import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  assertNoActiveDevServer,
  clearDevLock,
  readActiveDevLock,
  writeDevLock
} from "../../../scripts/next-dev-lock.mjs";

let tempDir;

function tempLockPath() {
  tempDir = mkdtempSync(path.join(tmpdir(), "cold-start-next-lock-"));
  return path.join(tempDir, ".next", "cold-start-dev.json");
}

describe("next dev lock", () => {
  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { force: true, recursive: true });
      tempDir = undefined;
    }
  });

  it("detects an active dev lock", () => {
    const lockPath = tempLockPath();

    writeDevLock(lockPath, 123);

    expect(readActiveDevLock(lockPath, (pid) => pid === 123)).toMatchObject({ pid: 123 });
    expect(() => assertNoActiveDevServer(lockPath)).not.toThrow();
  });

  it("blocks builds when the locked dev pid is still alive", () => {
    const lockPath = tempLockPath();
    writeDevLock(lockPath, process.pid);

    expect(() => assertNoActiveDevServer(lockPath)).toThrow(/Stop it before running next build/);
  });

  it("clears only its own active lock", () => {
    const lockPath = tempLockPath();

    writeDevLock(lockPath, process.pid);
    clearDevLock(lockPath, process.pid);

    expect(readActiveDevLock(lockPath)).toBeNull();
  });
});
