import { describe, expect, it } from "vitest";
import { parseExtractionToolUse } from "../src/index";

describe("parseExtractionToolUse", () => {
  it("extracts the forced tool payload", () => {
    const payload = parseExtractionToolUse({
      content: [
        { type: "text", text: "I will emit structured claims." },
        { type: "tool_use", name: "emit_company_claims", input: { identity: { name: "Cartesia" }, citations: [] } }
      ]
    });

    expect(payload).toEqual({ identity: { name: "Cartesia" }, citations: [] });
  });
});
