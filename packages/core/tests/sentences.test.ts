import { describe, expect, it } from "vitest";
import { firstSentence, sentenceCount, splitIntoSentences, takeSentences } from "../src/sentences";

describe("splitIntoSentences / firstSentence", () => {
  it("keeps the Huckberry sentence whole through first-sentence extraction despite the D.C. abbreviation", () => {
    const text =
      "Huckberry is an online retailer for premium menswear and outdoor gear that also operates two physical stores (Washington D.C. and Columbus). The brand emphasizes curated product drops and editorial content.";

    const sentences = splitIntoSentences(text);
    expect(sentences).toHaveLength(2);
    expect(sentences[0]).toBe(
      "Huckberry is an online retailer for premium menswear and outdoor gear that also operates two physical stores (Washington D.C. and Columbus)."
    );
    expect(firstSentence(text)).toBe(sentences[0]);
    expect(firstSentence(text)).not.toMatch(/D\.C\.$/);
  });

  it("does not split on D.C. even when the abbreviation is followed by a capitalized word", () => {
    const text = "Acme is headquartered in Washington D.C. Federal contracts drive most of its revenue.";
    expect(splitIntoSentences(text)).toEqual([text]);
  });

  it("does not split on U.S. followed by a capitalized word", () => {
    const text = "Acme sells only in the U.S. Market expansion is planned for next year.";
    expect(splitIntoSentences(text)).toEqual([text]);
  });

  it("does not split on U.K. followed by a capitalized word", () => {
    const text = "Acme has an office in the U.K. Growth is strong across Europe.";
    expect(splitIntoSentences(text)).toEqual([text]);
  });

  it("does not split on Inc. followed by a capitalized word", () => {
    const text = "The filing was made by Acme Inc. Revenue grew by double digits.";
    expect(splitIntoSentences(text)).toEqual([text]);
  });

  it("does not split on Corp. followed by a capitalized word", () => {
    const text = "The parent entity is Acme Corp. Subsidiaries operate independently.";
    expect(splitIntoSentences(text)).toEqual([text]);
  });

  it("does not split on Co. followed by a capitalized word", () => {
    const text = "The firm is registered as Smith & Co. Clients include major retailers.";
    expect(splitIntoSentences(text)).toEqual([text]);
  });

  it("does not split on Ltd. followed by a capitalized word", () => {
    const text = "The UK entity is Acme Ltd. Its board meets quarterly.";
    expect(splitIntoSentences(text)).toEqual([text]);
  });

  it("does not split on St. followed by a capitalized word", () => {
    const text = "The flagship store sits on Main St. Deliveries begin at 8am.";
    expect(splitIntoSentences(text)).toEqual([text]);
  });

  it("does not split on Dr. itself, only at the real sentence end that follows", () => {
    const text = "The lead investor is represented by Dr. Chen. Diligence continues through Q3.";
    const sentences = splitIntoSentences(text);
    expect(sentences).toHaveLength(2);
    expect(sentences[0]).toBe("The lead investor is represented by Dr. Chen.");
    expect(sentences[1]).toBe("Diligence continues through Q3.");
  });

  it("does not split on Jr. followed by a capitalized word", () => {
    const text = "The company was founded by John Smith Jr. Later successors expanded internationally.";
    expect(splitIntoSentences(text)).toEqual([text]);
  });

  it("does not split on Sr. followed by a capitalized word", () => {
    const text = "The report was authored by Maria Lopez Sr. Follow-up analysis is pending.";
    expect(splitIntoSentences(text)).toEqual([text]);
  });

  it("does not split on No. even when followed by a digit, not a lowercase word", () => {
    const text = "The claim was filed as Case No. 12 requires legal review. Outside counsel was retained in May.";
    const sentences = splitIntoSentences(text);
    expect(sentences).toHaveLength(2);
    expect(sentences[0]).toContain("No. 12");
  });

  it("does not split on vs. followed by a capitalized word", () => {
    const text = "The dispute pits Acme vs. Beta Corp in federal court. A ruling is expected in June.";
    const sentences = splitIntoSentences(text);
    expect(sentences).toHaveLength(2);
    expect(sentences[0]).toContain("vs. Beta Corp");
  });

  it("does not split on e.g. followed by a capitalized word", () => {
    const text =
      "The pricing plan includes discounts for annual commitments, e.g. Enterprise customers save 20 percent. Standard plans renew monthly.";
    const sentences = splitIntoSentences(text);
    expect(sentences).toHaveLength(2);
    expect(sentences[0]).toContain("e.g. Enterprise customers");
  });

  it("does not split on i.e. followed by a capitalized word", () => {
    const text =
      "The plan targets high-usage customers, i.e. Teams exceeding 50 seats. Smaller teams use the standard tier.";
    const sentences = splitIntoSentences(text);
    expect(sentences).toHaveLength(2);
    expect(sentences[0]).toContain("i.e. Teams exceeding");
  });

  it("never splits on the internal period of a decimal amount", () => {
    const text =
      "Valuation reached $6.2M in the seed round, up from $1.5M the prior year. The company plans to scale engineering.";
    const sentences = splitIntoSentences(text);
    expect(sentences).toHaveLength(2);
    expect(sentences[0]).toContain("$6.2M");
    expect(sentences[0]).toContain("$1.5M");
  });

  it("never splits on the internal period of a multiplier amount", () => {
    const text = "Usage grew 3.5x last year, driven by enterprise demand. Retention also improved.";
    const sentences = splitIntoSentences(text);
    expect(sentences).toHaveLength(2);
    expect(sentences[0]).toContain("3.5x");
  });

  it("still splits after a trailing decimal amount at a genuine sentence end", () => {
    const text = "The round totaled $6.2M. The company plans to use it for hiring.";
    expect(splitIntoSentences(text)).toEqual(["The round totaled $6.2M.", "The company plans to use it for hiring."]);
  });

  it("counts three real sentences correctly", () => {
    const text = "Acme sells to enterprises. It was founded in 2019. It has raised $40M to date.";
    expect(sentenceCount(text)).toBe(3);
    expect(splitIntoSentences(text)).toHaveLength(3);
  });

  it("caps takeSentences at the requested limit without truncating mid-sentence", () => {
    const text = "One sentence here. Two sentence here. Three sentence here.";
    expect(takeSentences(text, 2)).toEqual(["One sentence here.", "Two sentence here."]);
  });

  it("returns the whole trimmed text when there is no terminal punctuation", () => {
    const text = "  Huckberry sells outdoor gear and menswear  ";
    expect(splitIntoSentences(text)).toEqual(["Huckberry sells outdoor gear and menswear"]);
    expect(firstSentence(text)).toBe("Huckberry sells outdoor gear and menswear");
  });

  it("treats a run of mixed terminal punctuation as one boundary", () => {
    const text = "Is this correct?! It seems so.";
    expect(splitIntoSentences(text)).toEqual(["Is this correct?!", "It seems so."]);
  });

  it("returns an empty array for empty or whitespace-only input", () => {
    expect(splitIntoSentences("")).toEqual([]);
    expect(splitIntoSentences("   ")).toEqual([]);
    expect(sentenceCount("")).toBe(0);
  });

  it("does not split when the next sentence would start lowercase, even for an unlisted abbreviation", () => {
    const text = "The vendor is listed as Acme approx. usually within a week of the quote.";
    expect(splitIntoSentences(text)).toEqual([text]);
  });
});
