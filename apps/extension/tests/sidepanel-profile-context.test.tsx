// @vitest-environment jsdom

import { act } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  registerSidePanelHooks,
  cardWithManagement,
  jsonResponse,
  renderSidePanel,
} from "./sidepanel-harness";

describe("SidePanel profile context", () => {
  registerSidePanelHooks();

  it("renders core metrics and management as fixed company context", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(cardWithManagement("theinformation.com")));
    const { container, unmount } = await renderSidePanel({ domain: "theinformation.com", fetchMock });

    expect(container.querySelector("dl[aria-label='Core metrics']")).toBeTruthy();
    expect(container.textContent).toContain("Employees");
    expect(container.textContent).toContain("87");
    expect(container.textContent).toContain("2026-04-26");
    expect(container.textContent).toContain("theinformation.com");
    // The visible People section label is gone; the aria-label carries the section name.
    expect(container.querySelector("section[aria-label='Management team']")).toBeTruthy();
    expect(container.querySelector(".cs-people-line-label")).toBeNull();
    // The source count belongs to the filed stamp now, not the people status line.
    expect(container.querySelector(".cs-people-line-source")?.textContent).not.toContain("source");
    expect(container.textContent).toContain("Jessica Lessin");
    expect(container.textContent).not.toContain("jessica@theinformation.com");
    expect(container.textContent).toContain("1 work email");
    expect(container.querySelector("a[href='mailto:jessica@theinformation.com']")).toBeNull();
    expect(container.textContent).toContain("Matthew Resnick");
    expect(container.textContent).toContain("Amir Efrati");
    expect(container.textContent).toContain("Research");
    const peopleLine = container.querySelector(".cs-people-line");
    expect(peopleLine?.textContent?.match(/Jessica Lessin/g)).toHaveLength(1);
    expect(container.querySelector(".cs-management-team")).toBeNull();
    await unmount();
  });

  it("keeps personal contact emails inside the dossier", async () => {
    const card = cardWithManagement("tolans.com");
    card.identity.name = { value: "Tolan", status: "verified", confidence: "high", citationIds: ["c1"] };
    card.team.founders.value = [
      { name: "Quinten Farmer", role: "Co-founder & CEO", sourceUrl: "https://linkedin.com/in/quinten", email: "quintendf@gmail.com" }
    ];
    card.team.keyExecs.value = [];
    const fetchMock = vi.fn(async () => jsonResponse(card));
    const { container, unmount } = await renderSidePanel({ domain: "tolans.com", fetchMock });

    expect(container.textContent).toContain("1 email found");
    expect(container.textContent).not.toContain("quintendf@gmail.com");
    expect(container.querySelector("a[href='mailto:quintendf@gmail.com']")).toBeNull();
    expect(container.textContent).not.toContain("No verified work email found");

    const quinten = container.querySelector(".cs-people-person") as HTMLElement | null;
    expect(quinten).toBeTruthy();
    quinten!.getBoundingClientRect = () => ({
      bottom: 220,
      height: 44,
      left: 48,
      right: 360,
      top: 176,
      width: 312,
      x: 48,
      y: 176,
      toJSON: () => ({})
    });
    await act(async () => {
      quinten!.focus();
    });
    const dossierEmail = container.querySelector(".cs-shared-tooltip .cs-dossier-email");
    expect(dossierEmail?.textContent).toContain("quintendf@gmail.com");
    expect(dossierEmail?.textContent).toContain("Observed");
    await unmount();
  });

  it("shows the expanded company description in one shared tooltip overlay", async () => {
    const card = cardWithManagement("tolans.com");
    const shortDescription = "Tolan makes a voice-first AI companion app for young adults.";
    const expandedDescription = "Tolan makes a voice-first AI companion app for young adults. Its animated alien characters support daily check-ins and emotional wellbeing without trying to mimic a human therapist.";
    card.identity.description = {
      value: {
        shortDescription,
        expandedDescription,
        concept: null,
        serves: null,
        mechanism: null
      },
      status: "verified",
      confidence: "high",
      citationIds: ["c1"]
    };
    const fetchMock = vi.fn(async () => jsonResponse(card));
    const { container, unmount } = await renderSidePanel({ domain: "tolans.com", fetchMock });
    const summary = container.querySelector(".cs-company-summary");
    const summaryTrigger = container.querySelector(".cs-company-summary-more") as HTMLElement | null;
    expect(summary?.textContent).not.toContain("...");
    expect(summaryTrigger).toBeTruthy();
    expect(summaryTrigger?.textContent).toBe("(more)");
    expect(summaryTrigger?.getAttribute("aria-describedby")).toBe("cs-company-shared-tooltip");
    expect(container.querySelector(".cs-company-summary-trigger")).toBeNull();
    summaryTrigger!.getBoundingClientRect = () => ({
      bottom: 120,
      height: 20,
      left: 40,
      right: 320,
      top: 100,
      width: 280,
      x: 40,
      y: 100,
      toJSON: () => ({})
    });

    await act(async () => {
      summaryTrigger!.focus();
    });
    const tooltip = container.querySelector(".cs-shared-tooltip");
    expect(tooltip).toBeTruthy();
    expect(tooltip?.textContent).toContain("Description");
    expect(tooltip?.textContent).toContain("animated alien characters");
    expect(tooltip?.textContent).not.toMatch(/\.\.\.$/);
    expect(container.querySelectorAll(".cs-company-summary-popover")).toHaveLength(0);

    await act(async () => {
      summaryTrigger!.blur();
    });
    expect(container.querySelector(".cs-shared-tooltip")).toBeNull();
    await unmount();
  });

  it("uses structured description fields for the full summary tooltip", async () => {
    const card = cardWithManagement("decagon.ai");
    card.identity.name = { value: "Decagon", status: "verified", confidence: "high", citationIds: ["c1"] };
    card.identity.description = {
      value: {
        shortDescription: "Decagon sells AI agents that handle end-to-end customer support interactions...",
        concept: "AI agents for enterprise customer support.",
        serves: "Support, product, and operations teams at software companies.",
        mechanism: "The agents resolve tickets, execute backend actions, and escalate cases when automation is not enough."
      },
      status: "verified",
      confidence: "high",
      citationIds: ["c1"]
    };
    const fetchMock = vi.fn(async () => jsonResponse(card));
    const { container, unmount } = await renderSidePanel({ domain: "decagon.ai", fetchMock });
    const summary = container.querySelector(".cs-company-summary");
    const summaryTrigger = container.querySelector(".cs-company-summary-more") as HTMLElement | null;
    expect(summaryTrigger).toBeTruthy();
    expect(summary?.textContent).not.toContain("...");
    summaryTrigger!.getBoundingClientRect = () => ({
      bottom: 120,
      height: 20,
      left: 40,
      right: 320,
      top: 100,
      width: 280,
      x: 40,
      y: 100,
      toJSON: () => ({})
    });

    await act(async () => {
      summaryTrigger!.focus();
    });

    const tooltip = container.querySelector(".cs-shared-tooltip");
    expect(tooltip?.textContent).toContain("enterprise customer support");
    expect(tooltip?.textContent).toContain("execute backend actions");
    expect(tooltip?.textContent).not.toContain("...");
    await unmount();
  });

  it("does not turn core metric cells into tooltip triggers", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(cardWithManagement("theinformation.com")));
    const { container, unmount } = await renderSidePanel({ domain: "theinformation.com", fetchMock });
    const metricCells = Array.from(container.querySelectorAll("dl[aria-label='Core metrics'] > div")) as HTMLElement[];

    expect(metricCells.length).toBeGreaterThan(0);
    for (const cell of metricCells) {
      expect(cell.getAttribute("aria-describedby")).toBeNull();
      expect(cell.getAttribute("tabindex")).toBeNull();
    }

    await act(async () => {
      metricCells[0]!.focus();
    });
    expect(container.querySelector(".cs-shared-tooltip")).toBeNull();
    await unmount();
  });

  it("shows a cited dossier for visible people and a hover tooltip listing the hidden ones on the overflow control", async () => {
    const card = cardWithManagement("theinformation.com");
    card.team.keyExecs.value = [
      ...(card.team.keyExecs.value ?? []),
      { name: "Jill Abramson", role: "Advisor", sourceUrl: "https://linkedin.com/in/jill" },
      { name: "Martin Peers", role: "Columnist", sourceUrl: "https://theinformation.com/team" },
      { name: "Wayne Ma", role: "Reporter", sourceUrl: "https://theinformation.com/team" }
    ];
    const fetchMock = vi.fn(async () => jsonResponse(card));
    const { container, unmount } = await renderSidePanel({ domain: "theinformation.com", fetchMock });
    const personRows = Array.from(container.querySelectorAll(".cs-people-person")) as HTMLElement[];
    const jessica = personRows.find((row) => row.textContent?.includes("Jessica Lessin"));

    expect(personRows).toHaveLength(4);
    expect(jessica).toBeTruthy();
    expect(jessica?.getAttribute("aria-describedby")).toBe("cs-company-shared-tooltip");
    jessica!.getBoundingClientRect = () => ({
      bottom: 220,
      height: 44,
      left: 48,
      right: 360,
      top: 176,
      width: 312,
      x: 48,
      y: 176,
      toJSON: () => ({})
    });

    await act(async () => {
      jessica!.focus();
    });
    const tooltip = container.querySelector(".cs-shared-tooltip");
    expect(tooltip).toBeTruthy();
    expect(tooltip?.getAttribute("data-variant")).toBe("dossier");
    expect(tooltip?.textContent).toContain("Jessica Lessin");
    expect(tooltip?.querySelector(".cs-dossier-role")?.textContent).toContain("Founder");
    // No read on this person, so the serif read line stays absent (never filler).
    expect(tooltip?.querySelector(".cs-dossier-read")).toBeNull();
    expect(tooltip?.querySelector(".cs-dossier")?.getAttribute("data-has-read")).toBe("false");
    expect(tooltip?.querySelector(".cs-dossier-provenance")?.textContent).toContain("theinformation.com");
    const email = tooltip?.querySelector(".cs-dossier-email");
    expect(email?.textContent).toContain("jessica@theinformation.com");
    expect(email?.textContent).toContain("Observed");
    // The collection-metadata sentences from the old tooltip are gone.
    expect(tooltip?.textContent).not.toContain("Work email found in a public source.");

    await act(async () => {
      jessica!.blur();
    });
    expect(container.querySelector(".cs-shared-tooltip")).toBeNull();

    // The remaining two people (Martin Peers, Wayne Ma) sit behind the overflow chip,
    // which is a real pressable control: it earns a hover tooltip listing who it hides.
    const overflow = container.querySelector(".cs-people-more") as HTMLElement | null;
    expect(overflow).toBeTruthy();
    expect(overflow?.getAttribute("aria-describedby")).toBe("cs-company-shared-tooltip");
    expect(overflow?.getAttribute("aria-expanded")).toBe("false");
    overflow!.getBoundingClientRect = () => ({
      bottom: 640,
      height: 42,
      left: 48,
      right: 360,
      top: 598,
      width: 312,
      x: 48,
      y: 598,
      toJSON: () => ({})
    });

    await act(async () => {
      overflow!.focus();
    });
    const overflowTooltip = container.querySelector(".cs-shared-tooltip");
    expect(overflowTooltip).toBeTruthy();
    expect(overflowTooltip?.getAttribute("data-variant")).toBe("text");
    expect(overflowTooltip?.textContent).toContain("Martin Peers, Columnist");
    expect(overflowTooltip?.textContent).toContain("Wayne Ma, Reporter");

    await act(async () => {
      overflow!.blur();
    });
    expect(container.querySelector(".cs-shared-tooltip")).toBeNull();

    // Expanding the row leaves nothing hidden, so the chip drops its tooltip affordance.
    await act(async () => {
      (overflow as HTMLButtonElement).click();
    });
    expect(overflow?.getAttribute("aria-expanded")).toBe("true");
    expect(overflow?.getAttribute("aria-describedby")).toBeNull();
    await unmount();
  });

  it("renders the person read in the dossier evidence serif, cited by its own sources", async () => {
    const card = cardWithManagement("theinformation.com");
    // c3 resolves to registry.example, a domain the person's own channels never touch, so
    // the provenance whisper can only come from the read's citations.
    card.team.founders.value = [
      {
        name: "Jessica Lessin",
        role: "Founder & CEO",
        sourceUrl: "https://theinformation.com/about",
        email: "jessica@theinformation.com",
        emailStatus: "observed",
        read: { text: "Left a WSJ masthead role to build subscription-only tech reporting.", citationIds: ["c3"] }
      }
    ];
    card.team.keyExecs.value = [];
    const fetchMock = vi.fn(async () => jsonResponse(card));
    const { container, unmount } = await renderSidePanel({ domain: "theinformation.com", fetchMock });
    const jessica = Array.from(container.querySelectorAll(".cs-people-person")).find((row) =>
      row.textContent?.includes("Jessica Lessin")
    ) as HTMLElement | undefined;
    expect(jessica).toBeTruthy();
    jessica!.getBoundingClientRect = () => ({
      bottom: 220,
      height: 44,
      left: 48,
      right: 360,
      top: 176,
      width: 312,
      x: 48,
      y: 176,
      toJSON: () => ({})
    });

    await act(async () => {
      jessica!.focus();
    });
    const tooltip = container.querySelector(".cs-shared-tooltip");
    expect(tooltip?.querySelector(".cs-dossier")?.getAttribute("data-has-read")).toBe("true");
    const read = tooltip?.querySelector(".cs-dossier-read");
    expect(read).toBeTruthy();
    expect(read?.textContent).toContain("Left a WSJ masthead role");
    // The provenance whisper is the read's own sources (registry.example), not the row's
    // channel host (theinformation.com) masquerading as the read's source.
    const provenance = tooltip?.querySelector(".cs-dossier-provenance");
    expect(provenance?.textContent).toContain("registry.example");
    expect(provenance?.textContent).not.toContain("theinformation.com");
    // The now-interactive dossier restores a copy control on the email line.
    expect(tooltip?.querySelector(".cs-dossier-email-copy")).toBeTruthy();
    await unmount();
  });
});
