import { afterEach, describe, expect, it, vi } from "vitest";
import { assertEvalRigEnabled, dataDir } from "../src/app/eval/gate";

afterEach(() => vi.unstubAllEnvs());

describe("eval rig gate", () => {
  it("throws notFound when EVAL_RIG_ENABLED is unset", () => {
    vi.stubEnv("EVAL_RIG_ENABLED", "");
    expect(() => assertEvalRigEnabled()).toThrow();
  });

  it("passes when EVAL_RIG_ENABLED is true", () => {
    vi.stubEnv("EVAL_RIG_ENABLED", "true");
    expect(() => assertEvalRigEnabled()).not.toThrow();
  });

  it("dataDir requires EVAL_RIG_DATA_DIR", () => {
    vi.stubEnv("EVAL_RIG_DATA_DIR", "");
    expect(() => dataDir()).toThrow(/EVAL_RIG_DATA_DIR/);
    vi.stubEnv("EVAL_RIG_DATA_DIR", "/tmp/rig");
    expect(dataDir()).toBe("/tmp/rig");
  });
});
