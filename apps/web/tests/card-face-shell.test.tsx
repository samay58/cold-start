import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CardFace } from "../src/components/card/CardFace";
import { emptySectionsCard, richConflictCard, thinFileCard } from "./fixtures/gallery-cards";

function renderFace(card: Parameters<typeof CardFace>[0]["card"]) {
  return renderToStaticMarkup(<CardFace card={card} sections={[]} />);
}

describe("CardFace", () => {
  it("renders the call number, FILED stamp, and domain for a card with a vetted citation", () => {
    const html = renderFace(richConflictCard);

    expect(html).toContain("CS·VOXLATHE·26");
    expect(html).toContain("FILED");
    expect(html).toContain("voxlathe.example");
  });

  it("renders the THIN FILE stamp with a real source count for a sparse card", () => {
    const html = renderFace(thinFileCard);

    expect(html).toContain("THIN FILE");
    expect(html).toContain("2 sources on record");
  });

  it("still files a card whose only vetted citation is a filing, not a wire story", () => {
    const html = renderFace(emptySectionsCard);

    expect(html).toContain("CS·PLAINFIELD·26");
    expect(html).toContain("FILED");
    expect(html).not.toContain("THIN FILE");
  });
});
