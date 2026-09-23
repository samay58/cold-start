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

// Every filed judge verdict (about $1.70 a company) is keyed by these values, computed from the
// tree at 1d4018b before the writer prompt left the judge hash. A writer edit must never move
// them. A judge prompt or rules change legitimately does, and then these pins are updated on purpose.
describe("How it wins judge prompt hash", () => {
  it("stays byte-identical to the hash every filed verdict was judged under", () => {
    const rules = loadHowItWinsJudgeRules();
    expect(HOW_IT_WINS_JUDGE_PROMPT_HASH).toBe("0b01b0b45955046d53f0beeb6e81089cb47437b0ceb745342da6b92e427a509d");
    expect(howItWinsJudgePromptHash(rules, { refinement: true })).toBe("0d454bef083a0a5dc2bff4644be6d81311b9d6a253835c9222ee1a8e8fd72848");
    expect(howItWinsJudgePromptHash(rules, { refinement: false })).toBe("b2633fffff4ed4c100d8ab44367c5397d7be9f82e27d1d25b6c50d95324c3141");
    expect(howItWinsJudgePromptHash(rules, { refinement: true, screenIdentity: "x" })).toBe("9f80fefc8f61b5aaad3c9b9300cc444e2e1d7e263e3e6315d95b6624c303a077");
  });

  it("hashes the frozen V1 writer text, not the live writer prompt", () => {
    expect(HOW_IT_WINS_JUDGE_PROMPTS.frozenWriter).toBe(HOW_IT_WINS_FROZEN_WRITER_PROMPT_V1);
    expect(HOW_IT_WINS_WRITER_PROMPT_HASH).toMatch(/^[0-9a-f]{64}$/);
    expect(typeof HOW_IT_WINS_FROZEN_WRITER_PROMPT).toBe("string");
  });
});
