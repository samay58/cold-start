// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
  it("renders the full build tree from the first frame, no ledger, no toggle", async () => {
    const container = await render(
      <ResearchTrail events={[]} generationStatus="running" />
    );

    expect(container.querySelector(".cs-build-tree")).not.toBeNull();
    expect(container.querySelector(".cs-progress-ledger")).toBeNull();
    expect(container.querySelector(".cs-assembly-details-toggle")).toBeNull();

    const labels = Array.from(container.querySelectorAll(".cs-build-stage-copy strong")).map(
      (node) => node.textContent
    );
    expect(labels).toEqual(["Find", "Read", "Build", "File"]);

    // The active stage carries the constant quiet loader from the first frame.
    expect(
      container.querySelector('.cs-build-stage[data-active="true"] .cs-drizzle-loader')
    ).not.toBeNull();
  });

  it("advances the tree on source events", async () => {
    const container = await render(
      <ResearchTrail events={[sourceFound]} generationStatus="running" />
    );

    const active = container.querySelector('.cs-build-stage[data-active="true"]');
    expect(active?.querySelector("strong")?.textContent).toBe("Read");
    expect(container.textContent).toContain("3 sources found");
  });

  it("keeps the failure mark on the stage where the run died", async () => {
    const container = await render(
      <ResearchTrail
        events={[
          sourceFound,
          event({ id: "failed", type: "generation.failed", message: "Generation failed: provider error" })
        ]}
        generationStatus="running"
      />
    );

    expect(
      container.querySelector('.cs-build-stage[data-status="failed"]')
    ).not.toBeNull();
  });
});
