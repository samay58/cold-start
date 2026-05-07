import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { loadRepoRootEnv } from "../../../scripts/load-root-env.mjs";

const originalValue = process.env.COLD_START_RUNNER_TEST;
const originalNodeEnv = process.env.NODE_ENV;
const tempDirs = [];

describe("loadRepoRootEnv", () => {
  afterEach(() => {
    if (originalValue === undefined) {
      delete process.env.COLD_START_RUNNER_TEST;
    } else {
      process.env.COLD_START_RUNNER_TEST = originalValue;
    }

    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }

    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop(), { force: true, recursive: true });
    }
  });

  it("loads .env.local from the repo root before Next starts", () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "cold-start-env-"));
    tempDirs.push(repoRoot);
    writeFileSync(join(repoRoot, ".env.local"), "COLD_START_RUNNER_TEST=loaded-from-root\n");
    delete process.env.COLD_START_RUNNER_TEST;
    process.env.NODE_ENV = "development";

    const result = loadRepoRootEnv(repoRoot);

    expect(process.env.COLD_START_RUNNER_TEST).toBe("loaded-from-root");
    expect(result.loadedEnvFiles.map((file) => file.path)).toContain(".env.local");
  });
});
