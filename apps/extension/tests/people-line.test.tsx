// @vitest-environment jsdom

import type { ColdStartCard } from "@cold-start/core";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PeopleLine } from "../src/CompanyHeader";
import type { TooltipDossier } from "../src/SharedTooltip";

type CardPerson = NonNullable<ColdStartCard["team"]["keyExecs"]["value"]>[number];

type Captured = { body: string | TooltipDossier; id: string; title: string };

let cleanup: (() => Promise<void>) | null = null;

afterEach(async () => {
  if (cleanup) {
    await cleanup();
    cleanup = null;
  }
});

type CitationRef = { id: string; url: string };

async function renderPeople(
  people: CardPerson[],
  options?: { sourceCount?: number; citations?: CitationRef[] }
) {
  const captured: Captured[] = [];
  const hideTooltip = vi.fn();
  const tooltipProps = (input: { body: string | TooltipDossier; id: string; placement?: unknown; title: string }) => {
    captured.push({ body: input.body, id: input.id, title: input.title });
    return {
      "aria-describedby": "cs-company-shared-tooltip",
      onBlur: () => undefined,
      onFocus: () => undefined,
      onKeyDown: () => undefined,
      onPointerEnter: () => undefined,
      onPointerLeave: () => undefined
    };
  };
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <PeopleLine
        hideTooltip={hideTooltip}
        citations={options?.citations ?? []}
        companyDomain="acme.ai"
        people={people}
        sourceCount={options?.sourceCount ?? 2}
        tooltipProps={tooltipProps}
      />
    );
  });
  cleanup = async () => {
    await act(async () => root.unmount());
    container.remove();
  };
  return { container, hideTooltip, captured };
}

function dossiersFrom(captured: Captured[]): TooltipDossier[] {
  return captured
    .map((entry) => entry.body)
    .filter((body): body is TooltipDossier => typeof body === "object" && body !== null && body.kind === "dossier");
}

describe("PeopleLine visible row diet", () => {
  it("keeps only avatar, name, and role on the row", async () => {
    const { container } = await renderPeople([
      {
        name: "Ada Lovelace",
        role: "CEO",
        sourceUrl: "https://acme.ai/about",
        email: "ada.lovelace@acme.ai",
        emailStatus: "inferred",
        githubUrl: "https://github.com/ada"
      },
      {
        name: "Grace Hopper",
        role: "CTO",
        sourceUrl: "https://acme.ai/team",
        email: "grace@acme.ai",
        emailStatus: "observed"
      }
    ]);

    // Contact data stays in the dossier. The row has no mailto, chip, or copy affordance.
    expect(container.querySelector('a[href^="mailto:"]')).toBeNull();
    expect(container.querySelector(".cs-person-email")).toBeNull();
    expect(container.querySelector('a[href="https://github.com/ada"]')).toBeNull();
    expect(container.querySelector(".cs-person-channels")).toBeNull();
    expect(container.querySelector(".cs-person-email-kind")).toBeNull();
    expect(container.querySelector(".cs-person-contact-state")).toBeNull();
    expect(container.querySelector(".cs-person-email button")).toBeNull();
    expect(container.textContent).not.toContain("Copy");
  });

  it("kills the visible People label but keeps the aria-label", async () => {
    const { container } = await renderPeople([
      { name: "Ada Lovelace", role: "CEO", sourceUrl: "https://acme.ai/about" }
    ]);

    expect(container.querySelector('[aria-label="Management team"]')).toBeTruthy();
    expect(container.querySelector(".cs-people-line-label")).toBeNull();
    expect(container.textContent).not.toContain("People");
  });

  it("drops the trailing source count from the status line", async () => {
    const { container } = await renderPeople(
      [
        {
          name: "Ada Lovelace",
          role: "CEO",
          sourceUrl: "https://acme.ai/about",
          email: "ada@acme.ai",
          emailStatus: "observed"
        }
      ],
      { sourceCount: 5 }
    );

    const status = container.querySelector(".cs-people-line-source");
    expect(status).toBeTruthy();
    // The email summary still reads, but the source count is gone (the filed stamp owns it).
    expect(status?.textContent?.toLowerCase()).toContain("email");
    expect(status?.textContent?.toLowerCase()).not.toContain("source");
    expect(container.textContent).not.toContain("5 sources");
  });
});

describe("PeopleLine dossier", () => {
  it("moves the read, channels, and email provenance into the dossier", async () => {
    const { captured } = await renderPeople(
      [
        {
          name: "Ada Lovelace",
          role: "CEO",
          sourceUrl: "https://linkedin.com/in/ada",
          email: "ada@acme.ai",
          emailStatus: "observed",
          githubUrl: "https://github.com/ada",
          xUrl: "https://x.com/ada",
          read: { text: "Second robotics company; the first sold to Deere in 2021.", citationIds: ["s1", "s2"] }
        }
      ],
      {
        citations: [
          { id: "s1", url: "https://techcrunch.com/2021/deere-acquires" },
          { id: "s2", url: "https://www.deere.com/press/robotics" }
        ]
      }
    );

    const [dossier] = dossiersFrom(captured);
    expect(dossier).toBeTruthy();
    expect(dossier?.kind).toBe("dossier");
    expect(dossier?.name).toBe("Ada Lovelace");
    expect(dossier?.role).toBe("CEO");
    expect(dossier?.read).toEqual({
      text: "Second robotics company; the first sold to Deere in 2021.",
      citationIds: ["s1", "s2"]
    });
    expect(dossier?.email).toEqual({ address: "ada@acme.ai", basis: null, status: "observed" });
    expect(dossier?.channels).toEqual([
      { label: "GitHub", url: "https://github.com/ada" },
      { label: "X", url: "https://x.com/ada" }
    ]);
  });

  it("derives the provenance from the read's own citations, not the channel hosts", async () => {
    const { captured } = await renderPeople(
      [
        {
          name: "Ada Lovelace",
          role: "CEO",
          sourceUrl: "https://linkedin.com/in/ada",
          githubUrl: "https://github.com/ada",
          read: { text: "Second robotics company; the first sold to Deere in 2021.", citationIds: ["s1", "s2"] }
        }
      ],
      {
        citations: [
          { id: "s1", url: "https://techcrunch.com/2021/deere-acquires" },
          { id: "s2", url: "https://www.deere.com/press/robotics" }
        ]
      }
    );

    const [dossier] = dossiersFrom(captured);
    // The read is cited, so its provenance is the read's sources, deduped, www stripped.
    expect(dossier?.provenance).toBe("via techcrunch.com, deere.com");
    // The channel hosts (linkedin.com/github.com) do not masquerade as the read's source.
    expect(dossier?.provenance).not.toContain("linkedin.com");
    expect(dossier?.provenance).not.toContain("github.com");
  });

  it("falls back to the channel hosts only when there is no read", async () => {
    const { captured } = await renderPeople(
      [
        {
          name: "Grace Hopper",
          role: "CTO",
          sourceUrl: "https://acme.ai/team",
          email: "grace@acme.ai",
          emailStatus: "inferred",
          emailBasis: "domain pattern first, 3 observed addresses",
          githubUrl: "https://github.com/grace"
        }
      ],
      {
        // A read-less person never resolves citations for provenance, so these are ignored.
        citations: [{ id: "s1", url: "https://techcrunch.com/unrelated" }]
      }
    );

    const [dossier] = dossiersFrom(captured);
    expect(dossier?.read).toBeNull();
    expect(dossier?.email).toEqual({
      address: "grace@acme.ai",
      basis: "domain pattern first, 3 observed addresses",
      status: "inferred"
    });
    expect(dossier?.provenance).toContain("acme.ai");
    expect(dossier?.provenance).toContain("github.com");
    expect(dossier?.provenance).not.toContain("techcrunch.com");
  });
});

describe("PeopleLine overflow", () => {
  const many: CardPerson[] = [
    { name: "Ada Lovelace", role: "CEO", sourceUrl: "https://acme.ai/a", email: "ada@acme.ai", emailStatus: "observed" },
    { name: "Grace Hopper", role: "CTO", sourceUrl: "https://acme.ai/b" },
    { name: "Katherine Johnson", role: "Head of Research", sourceUrl: "https://acme.ai/c" },
    { name: "Dorothy Vaughan", role: "Engineering lead", sourceUrl: "https://acme.ai/d" },
    { name: "Mary Jackson", role: "Design lead", sourceUrl: "https://acme.ai/e" },
    { name: "Annie Easley", role: "Advisor", sourceUrl: "https://acme.ai/f" }
  ];

  it("reveals the remaining people when the overflow control is used", async () => {
    const { container } = await renderPeople(many);

    expect(container.querySelectorAll(".cs-people-person")).toHaveLength(4);
    const overflow = container.querySelector(".cs-people-more");
    expect(overflow).toBeTruthy();
    expect(overflow?.tagName).toBe("BUTTON");
    // Reads as an obvious expand affordance, not a bare "+2".
    expect(overflow?.textContent).toBe("+2 more");
    expect(overflow?.getAttribute("aria-expanded")).toBe("false");
    expect(overflow?.getAttribute("aria-label")).toBe("Show 2 more people");

    await act(async () => {
      (overflow as HTMLButtonElement).click();
    });

    expect(container.querySelectorAll(".cs-people-person")).toHaveLength(6);
    expect(container.textContent).toContain("Annie Easley");
    // The collapse label stays sensible once expanded.
    expect(overflow?.textContent).toBe("Show fewer");
    expect(overflow?.getAttribute("aria-expanded")).toBe("true");
    expect(overflow?.getAttribute("aria-label")).toBe("Show fewer people");
  });

  it("attaches a hover tooltip listing the hidden people's names and roles", async () => {
    const { captured } = await renderPeople(many);

    const chipCall = captured.find((entry) => entry.id === "people-more");
    expect(chipCall).toBeTruthy();
    expect(chipCall?.title).toBe("2 more");
    expect(chipCall?.body).toBe("Mary Jackson, Design lead\nAnnie Easley, Advisor");
  });

  it("drops the tooltip once expanded, since nothing is hidden anymore", async () => {
    const { container, captured } = await renderPeople(many);

    const overflow = container.querySelector(".cs-people-more") as HTMLButtonElement;
    await act(async () => {
      overflow.click();
    });

    // The chip never earns a second tooltipProps call once nothing is hidden.
    const chipCalls = captured.filter((entry) => entry.id === "people-more");
    expect(chipCalls).toHaveLength(1);
    expect(overflow.hasAttribute("aria-describedby")).toBe(false);
  });

  it("closes its own tooltip when expanding, so the open card is never orphaned", async () => {
    const { container, hideTooltip } = await renderPeople(many);

    const overflow = container.querySelector(".cs-people-more") as HTMLButtonElement;
    await act(async () => {
      overflow.click();
    });

    expect(hideTooltip).toHaveBeenCalled();
  });
});
