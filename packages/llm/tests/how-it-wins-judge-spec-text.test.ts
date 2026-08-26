import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  HOW_IT_WINS_JUDGMENT_STANDARD_TEXT,
  HOW_IT_WINS_STRATEGY_RUBRIC_TEXT
} from "../src/how-it-wins-judge-spec-text";

const specs = new URL("../../../docs/superpowers/specs/", import.meta.url);

function spec(name: string) {
  return readFileSync(fileURLToPath(new URL(name, specs)), "utf8");
}

// The judge reads the frozen module, not docs/. There is no regen script, so an edit to the
// markdown that never reaches the module would change the standard on paper and nowhere else.
// Regenerate with: node -e 'JSON.stringify each file into the two exports' (see the module header).
describe("how-it-wins frozen spec text", () => {
  it("matches the judgment standard markdown byte for byte", () => {
    expect(HOW_IT_WINS_JUDGMENT_STANDARD_TEXT).toBe(spec("2026-08-21-how-it-wins-judgment-standard.md"));
  });

  it("matches the strategy rubric markdown byte for byte", () => {
    expect(HOW_IT_WINS_STRATEGY_RUBRIC_TEXT).toBe(spec("2026-08-21-how-it-wins-strategy-rubric.md"));
  });
});
