import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CardFace } from "../src/components/card/CardFace";
import { ChoreographyProvider } from "../src/components/card/choreography";
import { ConflictPanel } from "../src/components/card/ConflictPanel";
import { PocketCard, type PocketTab } from "../src/components/card/PocketCard";
import { buildCitationIndex, headcountConflict, vettedCounts } from "../src/lib/card-face/model";
import { emptySectionsCard, richConflictCard, thinFileCard } from "./fixtures/gallery-cards";

function renderFace(card: Parameters<typeof CardFace>[0]["card"]) {
  return renderToStaticMarkup(<CardFace card={card} sections={[]} />);
}

function renderPocket(card: Parameters<typeof PocketCard>[0]["card"], initialTab?: PocketTab) {
  return renderToStaticMarkup(<PocketCard card={card} initialTab={initialTab} sections={[]} />);
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

  it("renders the five-slot stat strip with honest absences and the headcount conflict link", () => {
    const html = renderFace(richConflictCard);

    expect(html).toContain(">Stage<");
    expect(html).toContain(">Raised<");
    expect(html).toContain(">Headcount<");
    expect(html).toContain(">Valuation<");
    expect(html).toContain(">Founded<");
    expect(html).toContain("not publicly disclosed");
    expect(html).toContain('href="#headcount-conflict"');
    expect(html).toContain("$58M");
  });

  it("does not render 'founded YYYY' as a phrase in the header meta for a card with a foundedYear", () => {
    const html = renderFace(richConflictCard);

    expect(html).not.toMatch(/founded\s+\d{4}/i);
  });

  it("renders the section rows and the conflict panel on the rich, fully-populated card", () => {
    const html = renderFace(richConflictCard);

    expect(html).toContain(">Money<");
    expect(html).toContain("Both values stand. Cold Start does not average sources.");
    expect(html).toContain('id="headcount-conflict"');
    expect(html).toContain(">Signals<");
    expect(html).toContain("company claim, not independently confirmed");
    expect(html).toContain(
      "Filled in the side panel for invited readers. This card carries sourced facts only."
    );
  });

  it("shows the Money empty state and withholds Investor read on a thin file", () => {
    const html = renderFace(thinFileCard);

    expect(html).toContain("No public funding found.");
    expect(html).not.toContain("Investor read");
  });

  it("shows the Comps empty state on a card with no comparables but a vetted citation", () => {
    const html = renderFace(emptySectionsCard);

    expect(html).toContain("No comparable company is named by any source in this ledger.");
  });
});

// renderToStaticMarkup HTML-escapes text nodes (an apostrophe becomes &#x27;), so a raw
// citation.title containment check must escape the same way the rendered markup does.
function htmlEscaped(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("'", "&#x27;");
}

describe("SourcesRail", () => {
  it("renders every citation on the rich card, including one never cited inline, with its own [n] and source title", () => {
    const html = renderFace(richConflictCard);

    for (let displayNumber = 1; displayNumber <= richConflictCard.citations.length; displayNumber += 1) {
      expect(html).toContain(`[${displayNumber}]`);
    }
    expect(html).toContain("tracings · 6");
    for (const citation of richConflictCard.citations) {
      expect(html).toContain(htmlEscaped(citation.title));
    }
  });

  it("renders the VETTED chip with vettedCounts's own verified and total counts", () => {
    const html = renderFace(richConflictCard);
    const counts = vettedCounts(richConflictCard);

    expect(counts.total).toBeGreaterThan(0);
    expect(html).toContain(`VETTED · ${counts.verified} OF ${counts.total}`);
  });

  it("still files the footer's call number and filed line on a thin file", () => {
    const html = renderFace(thinFileCard);

    expect(html).toContain("sourced facts only");
  });
});

describe("ConflictPanel", () => {
  it("renders the compact footer, not the full footer, when compact is true", () => {
    const conflict = headcountConflict(richConflictCard);
    if (!conflict) {
      throw new Error("richConflictCard is expected to carry a headcount conflict");
    }
    const index = buildCitationIndex(richConflictCard);

    const html = renderToStaticMarkup(
      <ChoreographyProvider>
        <ConflictPanel compact conflict={conflict} index={index} />
      </ChoreographyProvider>
    );

    expect(html).toContain("Both stand. No average is shown.");
    expect(html).not.toContain("Both values stand. Cold Start does not average sources.");
  });

  it("renders plain receipt cite spans instead of the interactive CiteMark when onCiteClick is provided", () => {
    const conflict = headcountConflict(richConflictCard);
    if (!conflict) {
      throw new Error("richConflictCard is expected to carry a headcount conflict");
    }
    const index = buildCitationIndex(richConflictCard);

    // No ChoreographyProvider wrapper: the onCiteClick path never calls useChoreography, so it
    // must render standalone. CiteMark would throw ("must render inside a ChoreographyProvider")
    // if this path fell back to it.
    const html = renderToStaticMarkup(<ConflictPanel compact conflict={conflict} index={index} onCiteClick={() => {}} />);

    expect(html).toContain("data-cite-id");
    expect(html).toContain("cs-pocket-cite");
    expect(html).not.toContain("cs-face-cite");
    expect(html).not.toContain('role="button"');
    expect(html).not.toContain('tabindex="0"');
  });
});

describe("PocketCard", () => {
  it("renders all four tab labels on the default Card tab", () => {
    const html = renderPocket(richConflictCard);

    expect(html).toContain(">Card<");
    expect(html).toContain(">People<");
    expect(html).toContain(">Signals<");
    expect(html).toContain(">Sources<");
  });

  it("renders the compact conflict footer on the People tab", () => {
    const html = renderPocket(richConflictCard, "people");

    expect(html).toContain("Both stand. No average is shown.");
  });

  it("shows 'none named by a source' for empty comps on the Card tab", () => {
    const html = renderPocket(emptySectionsCard);

    expect(html).toContain("none named by a source");
  });

  it("renders the pocket footer's source count", () => {
    const html = renderPocket(richConflictCard);

    expect(html).toContain("6 sources");
  });

  it("does not render 'founded YYYY' as a phrase in PocketCard's header meta for a card with a foundedYear", () => {
    const html = renderPocket(richConflictCard);

    expect(html).not.toMatch(/founded\s+\d{4}/i);
  });
});
