import { describe, expect, it } from "vitest";
import { HOW_IT_WINS_JUDGMENT_STANDARD_TEXT, HOW_IT_WINS_STRATEGY_RUBRIC_TEXT } from "../src/how-it-wins-judge-spec-text";

// Samay's approved wording, September 24, 2026 (Task 4 of the evidence remediation plan): the judge
// accepts the three proofs the rubric already names, and reads missing evidence as missing.
describe("the proof the judge accepts", () => {
  it("asks Specialization for any of the three accepted proofs, not only a head-to-head result", () => {
    expect(HOW_IT_WINS_STRATEGY_RUBRIC_TEXT).toContain(
      "Does the evidence show a fit broader rivals lack, through a measured result, a capability they do not have, or customers choosing it for that fit, and not only that scope is narrow?"
    );
    expect(HOW_IT_WINS_STRATEGY_RUBRIC_TEXT).not.toContain("niche performance that broader rivals cannot match");
  });

  it("lets a capability rivals lack, or a customer's reason for choosing, show distinctiveness", () => {
    const sentence =
      "A trait comparable companies share is category baseline. A capability rivals lack, or a customer's stated reason for choosing, shows it is not; a head-to-head result is not required.";
    expect(HOW_IT_WINS_JUDGMENT_STANDARD_TEXT.split(sentence)).toHaveLength(3);
    expect(HOW_IT_WINS_JUDGMENT_STANDARD_TEXT).not.toContain("two comparable companies");
  });

  it("reads missing evidence as missing", () => {
    expect(HOW_IT_WINS_JUDGMENT_STANDARD_TEXT).toContain(
      "Missing evidence is not evidence against: head-to-head results and financials are rarely public for private companies. Strategies that fail the evidence gate"
    );
  });
});
