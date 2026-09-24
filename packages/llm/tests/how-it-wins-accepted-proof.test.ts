import { describe, expect, it } from "vitest";
import { HOW_IT_WINS_JUDGMENT_STANDARD_TEXT, HOW_IT_WINS_STRATEGY_RUBRIC_TEXT } from "../src/how-it-wins-judge-spec-text";

// Samay's approved wording, September 24, 2026: the judge accepts the three proofs the rubric
// already names, and reads missing evidence as missing. These pin the wording and where it sits in
// the standard, not how the file is laid out.
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
    const section = (heading: string) => {
      const start = HOW_IT_WINS_JUDGMENT_STANDARD_TEXT.indexOf(`## ${heading}`);
      const end = HOW_IT_WINS_JUDGMENT_STANDARD_TEXT.indexOf("\n## ", start + 1);
      return start < 0 ? "" : HOW_IT_WINS_JUDGMENT_STANDARD_TEXT.slice(start, end < 0 ? undefined : end);
    };
    // It governs both the positive case for the current strategy and the recorded dimensions.
    expect(section("Require a positive case for current")).toContain(sentence);
    expect(section("Record judgment dimensions without a score")).toContain(sentence);
    expect(HOW_IT_WINS_JUDGMENT_STANDARD_TEXT).not.toContain("two comparable companies");
  });

  it("reads missing evidence as missing", () => {
    expect(HOW_IT_WINS_JUDGMENT_STANDARD_TEXT).toContain(
      "Missing evidence is not evidence against: head-to-head results and financials are rarely public for private companies. Strategies that fail the evidence gate"
    );
  });
});
