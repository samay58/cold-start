// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { ProfileSummary } from "../src/company/CompanyHeader";
import type { TooltipDossier, TooltipMemo, TooltipPropsFor } from "../src/shared/SharedTooltip";

type CapturedBody = string | TooltipDossier | TooltipMemo;

function captureTooltipProps(captured: CapturedBody[]): TooltipPropsFor {
  return (input) => {
    captured.push(input.body);
    return {
      "aria-describedby": "cs-company-shared-tooltip",
      onBlur: () => undefined,
      onClick: () => undefined,
      onFocus: () => undefined,
      onKeyDown: () => undefined,
      onPointerEnter: () => undefined,
      onPointerLeave: () => undefined
    };
  };
}

let cleanup: (() => Promise<void>) | null = null;

async function mount(node: React.ReactElement) {
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

afterEach(async () => {
  await cleanup?.();
  cleanup = null;
});

const memoDescription = {
  paragraphs: [
    "Acme sells a scheduling engine hotels run at the front desk.",
    "How it charges is not publicly disclosed.",
    "It replaces paper logbooks and competes with legacy property systems."
  ],
  citationIds: ["c1"]
};

describe("ProfileSummary", () => {
  it("opens the expanded description as a memo window when the card carries one", async () => {
    const captured: CapturedBody[] = [];
    const container = await mount(
      <ProfileSummary
        expandedDescription={memoDescription}
        fullSummary="Acme runs scheduling."
        summary="Acme runs scheduling."
        tooltipProps={captureTooltipProps(captured)}
      />
    );

    expect(container.querySelector(".cs-company-summary-more")).toBeTruthy();
    expect(captured[0]).toEqual({ kind: "memo", paragraphs: memoDescription.paragraphs });
  });

  it("falls back to the untruncated one-liner tier when the field is absent", async () => {
    const captured: CapturedBody[] = [];
    const container = await mount(
      <ProfileSummary
        expandedDescription={null}
        fullSummary="Acme runs scheduling for hotels. Front desks use it to plan shifts and cover gaps."
        summary="Acme runs scheduling for hotels."
        tooltipProps={captureTooltipProps(captured)}
      />
    );

    expect(container.querySelector(".cs-company-summary-more")).toBeTruthy();
    expect(captured[0]).toBe("Acme runs scheduling for hotels. Front desks use it to plan shifts and cover gaps.");
  });

  it("renders no affordance when there is nothing beyond the summary", async () => {
    const captured: CapturedBody[] = [];
    const container = await mount(
      <ProfileSummary
        expandedDescription={null}
        fullSummary="Acme runs scheduling for hotels."
        summary="Acme runs scheduling for hotels."
        tooltipProps={captureTooltipProps(captured)}
      />
    );

    expect(container.querySelector(".cs-company-summary-more")).toBeNull();
    expect(captured).toHaveLength(0);
  });
});
