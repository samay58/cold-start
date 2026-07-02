// @vitest-environment jsdom

import type { ColdStartCard } from "@cold-start/core";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { PeopleLine } from "../src/CompanyHeader";

type CardPerson = NonNullable<ColdStartCard["team"]["keyExecs"]["value"]>[number];

const tooltipProps = () => ({
  "aria-describedby": "tip",
  onBlur: () => undefined,
  onFocus: () => undefined,
  onPointerEnter: () => undefined,
  onPointerLeave: () => undefined
});

let cleanup: (() => Promise<void>) | null = null;

afterEach(async () => {
  if (cleanup) {
    await cleanup();
    cleanup = null;
  }
});

async function renderPeople(people: CardPerson[]) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<PeopleLine companyDomain="acme.ai" people={people} sourceCount={2} tooltipProps={tooltipProps} />);
  });
  cleanup = async () => {
    await act(async () => root.unmount());
    container.remove();
  };
  return container;
}

describe("PeopleLine", () => {
  it("marks an inferred email distinctly from an observed one and renders channel links", async () => {
    const container = await renderPeople([
      {
        name: "Ada Lovelace",
        role: "CEO",
        sourceUrl: "https://acme.ai",
        email: "ada.lovelace@acme.ai",
        emailStatus: "inferred",
        githubUrl: "https://github.com/ada"
      },
      {
        name: "Grace Hopper",
        role: "CTO",
        sourceUrl: "https://acme.ai",
        email: "grace@acme.ai",
        emailStatus: "observed"
      }
    ]);

    const inferred = container.querySelector('[data-email-status="inferred"]');
    const observed = container.querySelector('[data-email-status="observed"]');
    expect(inferred).toBeTruthy();
    expect(observed).toBeTruthy();
    // The inferred email is visibly labeled as a guess; the observed one is not.
    expect(inferred?.textContent?.toLowerCase()).toContain("inferred");
    expect(observed?.textContent?.toLowerCase()).not.toContain("inferred");
    // Public channel link renders.
    expect(container.querySelector('a[href="https://github.com/ada"]')).toBeTruthy();
  });
});
