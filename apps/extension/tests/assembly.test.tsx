// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Clippings } from "../src/Clippings";
import { SealInstrument } from "../src/SealInstrument";
import { clippingsFromEvents, type Clipping } from "../src/clipping-model";
import type { ExtensionResearchRunEvent } from "../src/extension-config";

let cleanup: (() => Promise<void>) | null = null;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  document.body.innerHTML = "";
});

afterEach(async () => {
  if (cleanup) {
    await cleanup();
    cleanup = null;
  }
});

async function render(node: ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
  cleanup = async () => {
    await act(async () => root.unmount());
    container.remove();
  };
  return container;
}

function clipping(overrides: Partial<Clipping> & Pick<Clipping, "domain">): Clipping {
  return {
    url: `https://${overrides.domain}`,
    title: overrides.domain,
    sourceClass: "company_site",
    imageUrl: null,
    ...overrides
  };
}

function sourceEvent(sources: unknown[]): ExtensionResearchRunEvent {
  return {
    id: "sources",
    runId: "run-1",
    slug: "exa",
    domain: "exa.ai",
    sectionId: null,
    type: "source.found",
    message: "Found sources",
    metadata: { acceptedCount: sources.length, sources },
    createdAt: "2026-07-05T00:00:00.000Z"
  };
}

describe("Clippings", () => {
  it("reserves a quiet awaiting slot with no clipping items and no shimmer until events arrive", async () => {
    const container = await render(<Clippings clippings={[]} prefersReducedMotion={false} />);

    const region = container.querySelector(".cs-clippings");
    expect(region?.getAttribute("data-state")).toBe("awaiting");
    expect(container.querySelector(".cs-clippings-rule")).not.toBeNull();
    expect(container.querySelectorAll(".cs-clipping")).toHaveLength(0);
    // No skeleton shimmer element in the awaiting slot.
    expect(container.querySelector("[class*='shimmer']")).toBeNull();
  });

  it("settles into one clipping per source, each with a classification dot, domain, and kind", async () => {
    const clippings = clippingsFromEvents([
      sourceEvent([
        { url: "https://exa.ai/", domain: "exa.ai", title: "Exa", sourceType: "company_site", imageUrl: null },
        { url: "https://techcrunch.com/exa", domain: "techcrunch.com", title: "Exa raises a round", sourceType: "news", imageUrl: null }
      ])
    ]);
    const container = await render(<Clippings clippings={clippings} prefersReducedMotion={false} />);

    const region = container.querySelector(".cs-clippings");
    expect(region?.getAttribute("data-state")).toBe("settled");
    const items = container.querySelectorAll(".cs-clipping");
    expect(items).toHaveLength(2);
    expect(items[0]?.querySelector(".cs-clipping-dot")?.getAttribute("data-source-class")).toBe("company_site");
    expect(items[0]?.querySelector(".cs-clipping-domain")?.textContent).toBe("exa.ai");
    expect(items[1]?.querySelector(".cs-clipping-dot")?.getAttribute("data-source-class")).toBe("funding");
    expect(container.textContent).toContain("Funding");
  });

  it("falls back to a plain classification dot instead of a favicon when the chrome api is absent", async () => {
    const container = await render(
      <Clippings clippings={[clipping({ domain: "exa.ai" })]} prefersReducedMotion={false} />
    );

    expect(container.querySelector(".cs-clipping-favicon")).toBeNull();
    expect(container.querySelector(".cs-clipping-dot")).not.toBeNull();
  });

  it("renders at most two thumbnails and marks them safe and lazy", async () => {
    const clippings = [
      clipping({ domain: "a.com", sourceClass: "funding", imageUrl: "https://img/a.png" }),
      clipping({ domain: "b.com", sourceClass: "news", imageUrl: "https://img/b.png" }),
      clipping({ domain: "c.com", sourceClass: "news", imageUrl: "https://img/c.png" })
    ];
    const container = await render(<Clippings clippings={clippings} prefersReducedMotion={false} />);

    const thumbs = container.querySelectorAll<HTMLImageElement>(".cs-clipping-thumb");
    expect(thumbs).toHaveLength(2);
    expect(thumbs[0]?.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(thumbs[0]?.getAttribute("loading")).toBe("lazy");
  });

  it("hides a broken thumbnail back to the favicon form on error", async () => {
    const clippings = [
      clipping({ domain: "a.com", sourceClass: "funding", imageUrl: "https://img/a.png" }),
      clipping({ domain: "b.com", sourceClass: "news", imageUrl: "https://img/b.png" })
    ];
    const container = await render(<Clippings clippings={clippings} prefersReducedMotion={false} />);

    expect(container.querySelectorAll(".cs-clipping-thumb")).toHaveLength(2);
    const firstThumb = container.querySelector<HTMLImageElement>(".cs-clipping-thumb");
    await act(async () => {
      firstThumb?.dispatchEvent(new Event("error"));
    });
    expect(container.querySelectorAll(".cs-clipping-thumb")).toHaveLength(1);
  });
});

describe("SealInstrument", () => {
  it("shows an un-filed seal at the opening level", async () => {
    const container = await render(<SealInstrument level={0} prefersReducedMotion={false} />);
    const seal = container.querySelector(".cs-seal-inst");
    expect(seal?.getAttribute("data-level")).toBe("0");
    expect(seal?.getAttribute("data-filed")).toBe("false");
    expect(container.querySelector(".cs-seal-inst-ring")).not.toBeNull();
    expect(container.querySelector(".cs-seal-inst-fill")).not.toBeNull();
  });

  it("becomes the filed stamp at the top level", async () => {
    const container = await render(<SealInstrument level={4} prefersReducedMotion={false} />);
    const seal = container.querySelector(".cs-seal-inst");
    expect(seal?.getAttribute("data-level")).toBe("4");
    expect(seal?.getAttribute("data-filed")).toBe("true");
  });

  it("renders under reduced motion without a level or filed regression", async () => {
    const container = await render(<SealInstrument level={2} prefersReducedMotion={true} />);
    const seal = container.querySelector(".cs-seal-inst");
    expect(seal?.getAttribute("data-level")).toBe("2");
    expect(seal?.getAttribute("data-filed")).toBe("false");
  });
});
