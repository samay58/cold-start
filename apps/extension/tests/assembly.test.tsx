// @vitest-environment jsdom

import { act, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Clippings } from "../src/company/Clippings";
import { SealInstrument } from "../src/company/SealInstrument";
import { clippingsFromEvents, type Clipping } from "../src/company/clipping-model";
import type { ExtensionResearchRunEvent } from "../src/shared/extension-config";

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
  vi.useRealTimers();
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
    title: overrides.note ?? overrides.domain,
    note: "How the company describes its product and position",
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

function ClippingArrivalHarness() {
  const [clippings, setClippings] = useState([
    clipping({ domain: "a.com", note: "Company positioning" }),
    clipping({ domain: "b.com", note: "Product documentation" }),
    clipping({ domain: "c.com", note: "Customer evidence" })
  ]);
  return (
    <>
      <button
        onClick={() => setClippings((current) => [
          ...current,
          clipping({ domain: "d.com", note: "Funding history" })
        ])}
        type="button"
      >
        Add source
      </button>
      <Clippings clippings={clippings} prefersReducedMotion={false} variant="carousel" />
    </>
  );
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

  it("keeps one source in focus with only two faded sources waiting behind it", async () => {
    const clippings = [
      clipping({ domain: "a.com", note: "Company positioning" }),
      clipping({ domain: "b.com", note: "Product documentation" }),
      clipping({ domain: "c.com", note: "Customer evidence" }),
      clipping({ domain: "d.com", note: "Funding history" })
    ];
    const container = await render(
      <Clippings clippings={clippings} prefersReducedMotion={true} variant="carousel" />
    );

    const items = container.querySelectorAll(".cs-clipping");
    expect(items).toHaveLength(3);
    expect(items[0]?.getAttribute("data-active")).toBe("true");
    expect(items[1]?.getAttribute("data-position")).toBe("1");
    expect(items[2]?.getAttribute("data-position")).toBe("2");
    expect(container.textContent).toContain("Company positioning");
    expect(container.textContent).not.toContain("Funding history");
  });

  it("brings a newly arrived source straight into focus", async () => {
    const container = await render(<ClippingArrivalHarness />);

    await act(async () => {
      container.querySelector("button")?.click();
    });

    const active = container.querySelector('.cs-clipping[data-active="true"]');
    expect(active?.textContent).toContain("Funding history");
  });

  it("cycles through every source instead of stopping after six", async () => {
    vi.useFakeTimers();
    const clippings = Array.from({ length: 8 }, (_, index) =>
      clipping({ domain: `${String.fromCharCode(97 + index)}.com`, note: `Source ${index + 1}` })
    );
    const container = await render(
      <Clippings clippings={clippings} prefersReducedMotion={false} variant="carousel" />
    );

    await act(async () => {
      vi.advanceTimersByTime(6 * 3400);
    });

    const active = container.querySelector('.cs-clipping[data-active="true"]');
    expect(active?.textContent).toContain("Source 7");
    expect(container.textContent).toContain("8 found");
  });

  it("keeps its reading focus still under reduced motion", async () => {
    vi.useFakeTimers();
    const clippings = [
      clipping({ domain: "a.com", note: "Company positioning" }),
      clipping({ domain: "b.com", note: "Product documentation" }),
      clipping({ domain: "c.com", note: "Customer evidence" }),
      clipping({ domain: "d.com", note: "Funding history" })
    ];
    const container = await render(
      <Clippings clippings={clippings} prefersReducedMotion={true} variant="carousel" />
    );
    const before = container.querySelector('.cs-clipping[data-active="true"]')?.textContent;

    await act(async () => {
      vi.advanceTimersByTime(10_200);
    });

    expect(container.querySelector('.cs-clipping[data-active="true"]')?.textContent).toBe(before);
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

  it("only thumbnails news, funding, and customer_proof clippings, even when other classes carry an imageUrl", async () => {
    const clippings = [
      clipping({ domain: "a.com", sourceClass: "company_site", imageUrl: "https://img/a.png" }),
      clipping({ domain: "b.com", sourceClass: "funding", imageUrl: "https://img/b.png" }),
      clipping({ domain: "c.com", sourceClass: "customer_proof", imageUrl: "https://img/c.png" }),
      clipping({ domain: "d.com", sourceClass: "news", imageUrl: "https://img/d.png" })
    ];
    const container = await render(<Clippings clippings={clippings} prefersReducedMotion={false} />);

    const thumbs = container.querySelectorAll<HTMLImageElement>(".cs-clipping-thumb");
    expect(thumbs).toHaveLength(2);
    const items = container.querySelectorAll(".cs-clipping");
    expect(items[0]?.querySelector(".cs-clipping-thumb")).toBeNull();
  });

  it("hides a broken favicon back to the classification dot on error", async () => {
    vi.stubGlobal("chrome", {
      runtime: {
        getURL: (path: string) => `chrome-extension://abc/${path}`,
        getManifest: () => ({ permissions: ["favicon", "activeTab", "storage"] })
      }
    });
    try {
      const container = await render(
        <Clippings clippings={[clipping({ domain: "exa.ai" })]} prefersReducedMotion={false} />
      );

      const favicon = container.querySelector<HTMLImageElement>(".cs-clipping-favicon");
      expect(favicon).not.toBeNull();
      await act(async () => {
        favicon?.dispatchEvent(new Event("error"));
      });
      expect(container.querySelector(".cs-clipping-favicon")).toBeNull();
      expect(container.querySelector(".cs-clipping-dot")).not.toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
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
