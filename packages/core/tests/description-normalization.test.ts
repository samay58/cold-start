import { describe, expect, it } from "vitest";
import { cleanDescriptionText, completeDescriptionSentence } from "../src/description-normalization";

describe("cleanDescriptionText", () => {
  it("drops a bare-TLD fragment sentence left by a split domain", () => {
    // The exact artifact the exa card stored on 2026-06-18: the model emitted "com." as its
    // own sentence mid-description and every surface downstream rendered it.
    const corrupt =
      "Exa operates its own crawler to provide search results optimized for large language models and AI agents. com. The company differentiates by owning the full search stack.";
    expect(cleanDescriptionText(corrupt)).toBe(
      "Exa operates its own crawler to provide search results optimized for large language models and AI agents. The company differentiates by owning the full search stack."
    );
  });

  it("drops a trailing bare-TLD fragment", () => {
    expect(cleanDescriptionText("Search built for AI agents. com.")).toBe("Search built for AI agents.");
  });

  it("keeps a real sentence that ends in a TLD-shaped word", () => {
    const legit = "The product is generative ai. The company sells it to developers.";
    expect(cleanDescriptionText(legit)).toBe(legit);
  });

  it("keeps ordinary prose untouched", () => {
    const prose = "Serves engineering teams at AI-native companies. Stores all index state in object storage.";
    expect(cleanDescriptionText(prose)).toBe(prose);
  });
});

describe("completeDescriptionSentence", () => {
  it("still terminates a clean sentence", () => {
    expect(completeDescriptionSentence("Sells a serverless search database")).toBe(
      "Sells a serverless search database."
    );
  });
});
