import { describe, expect, it } from "vitest";

import {
  HOW_IT_WINS_FROZEN_WRITER_PROMPT,
  HOW_IT_WINS_FROZEN_WRITER_PROMPT_V1,
  HOW_IT_WINS_JUDGE_PROMPTS,
  HOW_IT_WINS_JUDGE_PROMPT_HASH,
  HOW_IT_WINS_WRITER_PROMPT_HASH,
  howItWinsJudgePromptHash,
  loadHowItWinsJudgeRules
} from "../src";

// Every filed judge verdict (about $1.70 a company) is keyed by these values. A writer edit must
// never move them. A judge prompt or rules change legitimately does, and then these pins are
// updated on purpose: last on September 24, 2026, for the accepted-proof wording in the standard
// and the rubric, so verdicts filed under the earlier rules miss their memo once.
describe("How it wins judge prompt hash", () => {
  it("stays byte-identical to the hash every filed verdict was judged under", () => {
    const rules = loadHowItWinsJudgeRules();
    expect(HOW_IT_WINS_JUDGE_PROMPT_HASH).toBe("0b01b0b45955046d53f0beeb6e81089cb47437b0ceb745342da6b92e427a509d");
    expect(howItWinsJudgePromptHash(rules, { refinement: true })).toBe("4e4ebe610044e8e870f3bd7db56edd0350446f67388adf0e94f353a2ef08d2b2");
    expect(howItWinsJudgePromptHash(rules, { refinement: false })).toBe("2c8edecdfb6afc53f0bdd013a755e80670c497cdce9a38b71c9ecdd92594b988");
    expect(howItWinsJudgePromptHash(rules, { refinement: true, screenIdentity: "x" })).toBe("00ea1aa5c080ff14a88d9a9e57c132c427d9038b81e023cadb14e7ba4ab2ca6c");
  });

  it("hashes the frozen V1 writer text, not the live writer prompt", () => {
    expect(HOW_IT_WINS_JUDGE_PROMPTS.frozenWriter).toBe(HOW_IT_WINS_FROZEN_WRITER_PROMPT_V1);
    expect(HOW_IT_WINS_WRITER_PROMPT_HASH).toMatch(/^[0-9a-f]{64}$/);
    expect(typeof HOW_IT_WINS_FROZEN_WRITER_PROMPT).toBe("string");
  });
});
