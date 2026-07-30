// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResearchTrail } from "../src/research/ResearchTrail";
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

function event(input: Partial<ExtensionResearchRunEvent> & Pick<ExtensionResearchRunEvent, "id" | "type">): ExtensionResearchRunEvent {
  return {
    runId: "run-1",
    slug: "exa",
    domain: "exa.ai",
    sectionId: null,
    message: "",
    metadata: {},
    createdAt: "2026-07-30T00:00:00.000Z",
    ...input
  };
}

const sourceFound = event({
  id: "sources",
  type: "source.found",
  message: "Found 3 accepted sources",
  metadata: { acceptedCount: 3 }
});

describe("ResearchTrail", () => {
  it("renders the four verb stages with drawn marks and one running pulse, no Stages heading", async () => {
    const container = await render(
      <ResearchTrail companyDomain="exa.ai" events={[sourceFound]} generationStatus="running" />
    );

    const labels = Array.from(container.querySelectorAll(".cs-progress-ledger-label")).map(
      (node) => node.textContent
    );
    expect(labels).toEqual(["Find", "Read", "Build", "File"]);
    expect(container.textContent).not.toContain("Stages");

    // Done stages carry a drawn check; exactly one stage runs, and its mark is the live pulse.
    expect(container.querySelector('.cs-progress-ledger-mark[data-status="done"] svg')).not.toBeNull();
    const runningMarks = container.querySelectorAll('.cs-progress-ledger-mark[data-status="running"]');
    expect(runningMarks).toHaveLength(1);
    expect(runningMarks[0]?.querySelector("svg")).toBeNull();

    // Only the active stage speaks a proof line; waiting stages stay quiet rows.
    expect(container.querySelectorAll(".cs-progress-ledger-note")).toHaveLength(1);
  });

  it("replaces the ledger with the event tree while Details is open, never showing both", async () => {
    const container = await render(
      <ResearchTrail companyDomain="exa.ai" events={[sourceFound]} generationStatus="running" />
    );

    expect(container.querySelector(".cs-progress-ledger")).not.toBeNull();

    const toggle = container.querySelector<HTMLButtonElement>(".cs-assembly-details-toggle");
    expect(toggle?.textContent).toBe("Details");
    await act(async () => {
      toggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.querySelector(".cs-progress-ledger")).toBeNull();
    expect(toggle?.textContent).toBe("Hide details");

    await act(async () => {
      toggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.querySelector(".cs-progress-ledger")).not.toBeNull();
  });

  it("keeps the failure mark on the stage where the run died", async () => {
    const container = await render(
      <ResearchTrail
        companyDomain="exa.ai"
        events={[
          sourceFound,
          event({ id: "failed", type: "generation.failed", message: "Generation failed: provider error" })
        ]}
        generationStatus="running"
      />
    );

    // Attention auto-opens the tree in place of the ledger; the toggle disappears with it.
    expect(container.querySelector(".cs-progress-ledger")).toBeNull();
    expect(container.querySelector(".cs-assembly-details-toggle")).toBeNull();
    // The tree chunk is lazy; wait for the dynamic import to settle.
    await act(async () => {
      await vi.dynamicImportSettled();
    });
    expect(container.querySelector(".cs-build-tree")).not.toBeNull();
  });
});
