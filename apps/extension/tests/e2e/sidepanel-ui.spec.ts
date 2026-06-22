import { expect, test } from "@playwright/test";
import {
  browserbaseCard,
  browserbaseCardWithSynthesis,
  fulfillJson,
  granolaCard,
  installChromeShim,
  mockExtensionApi
} from "./fixtures";
import { dragWithSamples, expectFocusedElementVisible, expectPointerAttached } from "./interaction-probes";

async function openSidePanel(page: Parameters<typeof installChromeShim>[0]) {
  await page.goto("/sidepanel.html");
  await expect(page.locator("#root > *")).toHaveCount(1);
}

test("cached card renders the research layer without old analyze affordances", async ({ page }) => {
  await installChromeShim(page);
  await mockExtensionApi(page, browserbaseCardWithSynthesis());
  await openSidePanel(page);

  await expect(page.getByRole("heading", { name: "Browserbase" })).toBeVisible();
  await expect(page.getByLabel("Research layer")).toBeVisible();
  await expect(page.locator(".cs-company-logo img")).toHaveAttribute("src", /icons\.duckduckgo\.com\/ip3\/browserbase\.com\.ico/);
  await expect(page.locator(".cs-research-brand")).toHaveCount(0);
  await expect(page.locator(".cs-extension-brand")).toHaveCount(0);
  await expect(page.locator(".cs-extension-mark")).toHaveCount(0);
  await expect(page.getByLabel("Research card stack")).toBeVisible();
  await expect(page.locator(".cs-card-tray-head")).toContainText("Research stack");
  await expect(page.locator(".cs-dormant-card").first()).toHaveAttribute("aria-label", /File .* into Research/);
  await expect(page.locator(".cs-dormant-card-index").first()).toHaveText("03");
  await expect(page.locator(".cs-dormant-card-index i")).toHaveCount(0);
  await expect(page.locator(".cs-card-plus")).toHaveCount(0);
  await expect(page.getByText("Browserbase turns browser automation into agent infrastructure")).toBeVisible();
  await expect(page.getByLabel("Company context").getByRole("link", { name: "browserbase.com" })).toHaveAttribute("target", "_blank");
  await expect(page.getByText("[c1]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Analyze" })).toHaveCount(0);
  await page.screenshot({ fullPage: true, path: "/private/tmp/cold-start-extension-rest.png" });
});

test("granola signals module clusters duplicate raise coverage into corroborated events", async ({ page }) => {
  await installChromeShim(page, { activeDomain: "granola.ai" });
  await mockExtensionApi(page, granolaCard());
  await openSidePanel(page);

  await expect(page.getByRole("heading", { name: "Granola" })).toBeVisible();
  const dormantSignals = page.locator(".cs-dormant-card", { hasText: "Signals" });
  await dormantSignals.scrollIntoViewIfNeeded();
  await dormantSignals.focus();
  await page.keyboard.press("Enter");

  const active = page.locator('.cs-active-enrichment[data-layer-id="signals"]');
  await expect(active).toBeVisible();
  await expect(active).toHaveAttribute("data-expanded", "true");

  // 10 raw signals, 8 covering the same raise: the module renders 3 events with honest counts.
  await expect(active.locator(".cs-active-enrichment-head small")).toHaveText("3 events · 10 sources");
  const rows = active.locator(".cs-layer-signal-ledger li");
  await expect(rows).toHaveCount(3);
  await expect(active.getByText("×8 corroborated")).toBeVisible();
  // Headlines lead each row; category words stay in the quiet metadata line, never bolded.
  await expect(rows.locator("strong").first()).not.toHaveText(/^(funding|news|launch|hiring|filing|github|other)$/);
  await expect(active.getByText("Granola raises $125M at $1.5B valuation", { exact: false })).toBeVisible();
  await expect(rows.filter({ hasText: "raises $125M" })).toHaveCount(1);

  await active.scrollIntoViewIfNeeded();
  await page.waitForTimeout(450);
  await active.screenshot({ path: "/private/tmp/cold-start-granola-signals.png" });
  await page.screenshot({ fullPage: true, path: "/private/tmp/cold-start-granola-panel.png" });
});

test("summary tooltip opens from keyboard focus and clears on blur", async ({ page }) => {
  const longSummary = [
    "Browserbase gives AI teams a managed browser workbench for agents that need to navigate real sites, preserve session state, and observe what happened after each run.",
    "It packages browser sessions, proxies, instrumentation, and automation APIs so developers can file the messy web-navigation layer behind one infrastructure surface.",
    "The company matters when agent products move from demos to repeatable workflows that need stable browsers, traceable logs, and a clean handoff back to human operators."
  ].join(" ");
  const card = browserbaseCard({
    identity: {
      ...browserbaseCard().identity,
      description: {
        value: {
          shortDescription: longSummary,
          concept: "Managed browser infrastructure for AI agent workflows.",
          serves: "AI application developers and automation teams.",
          mechanism: "Hosted browser sessions, proxies, observability, and automation APIs."
        },
        status: "verified",
        confidence: "medium",
        citationIds: ["c1", "c2", "c3"]
      }
    }
  });

  await installChromeShim(page);
  await mockExtensionApi(page, card);
  await openSidePanel(page);

  const summary = page.locator(".cs-company-summary-more");
  await expect(summary).toBeVisible();
  await expect(summary).toHaveText("(more)");
  await expect(summary).toHaveAttribute("aria-describedby", "cs-company-shared-tooltip");
  await summary.focus();
  await expectFocusedElementVisible(page);

  const tooltip = page.locator("#cs-company-shared-tooltip");
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText("Description");
  await expect(tooltip).toContainText("Managed browser infrastructure for AI agent workflows");
  await expect(tooltip).toHaveAttribute("data-placement", "below");

  await summary.evaluate((element) => {
    (element as HTMLButtonElement).blur();
  });
  await expect(tooltip).toHaveCount(0);
});

test("keyboard-reachable controls keep visible focus targets", async ({ page }) => {
  await installChromeShim(page);
  await mockExtensionApi(page, browserbaseCardWithSynthesis());
  await openSidePanel(page);

  const controls = [
    page.getByLabel("Company context").getByRole("link", { name: "browserbase.com" }),
    page.locator(".cs-active-enrichment", { hasText: "Next question" }).getByRole("button"),
    page.locator(".cs-dormant-card", { hasText: "Who pays" }),
    page.locator(".cs-dormant-card", { hasText: "Money" })
  ];

  for (const control of controls) {
    await control.scrollIntoViewIfNeeded();
    await control.focus();
    await expect(control).toBeFocused();
    await expectFocusedElementVisible(page);
  }
});

test("no-source partial card auto-regenerates before rendering the dossier", async ({ page }) => {
  const generateRequests: Array<{ mode?: string }> = [];
  let generationStarted = false;
  const partialCard = browserbaseCard({
    slug: "databricks",
    domain: "databricks.com",
    cacheStatus: "partial",
    identity: {
      ...browserbaseCard().identity,
      name: { value: "databricks.com", status: "unknown", confidence: "low", citationIds: [] },
      websiteUrl: { value: null, status: "unknown", confidence: "low", citationIds: [] },
      oneLiner: { value: null, status: "unknown", confidence: "low", citationIds: [] },
      hq: { value: null, status: "unknown", confidence: "low", citationIds: [] },
      foundedYear: { value: null, status: "unknown", confidence: "low", citationIds: [] }
    },
    funding: {
      totalRaisedUsd: { value: null, status: "unknown", confidence: "low", citationIds: [] },
      lastRound: { value: null, status: "unknown", confidence: "low", citationIds: [] },
      investors: { value: null, status: "unknown", confidence: "low", citationIds: [] }
    },
    team: {
      founders: { value: [], status: "unknown", confidence: "low", citationIds: [] },
      keyExecs: { value: [], status: "unknown", confidence: "low", citationIds: [] },
      headcount: { value: null, status: "unknown", confidence: "low", citationIds: [] }
    },
    signals: [],
    comparables: [],
    citations: []
  });
  const usableCard = browserbaseCard({
    slug: "databricks",
    domain: "databricks.com",
    identity: {
      ...browserbaseCard().identity,
      name: { value: "Databricks", status: "verified", confidence: "high", citationIds: ["c1"] },
      websiteUrl: { value: "https://databricks.com/", status: "verified", confidence: "high", citationIds: ["c1"] }
    }
  });
  await installChromeShim(page, { activeDomain: "databricks.com" });
  await page.route("**/api/extension/bootstrap?**", async (route) => {
    await fulfillJson(route, {
      domain: "databricks.com",
      slug: "databricks",
      card: partialCard,
      runs: {
        basics: { slug: "databricks", domain: "databricks.com", mode: "basics", status: "idle" },
        analysis: { slug: "databricks", domain: "databricks.com", mode: "analysis", status: "idle" }
      }
    });
  });
  await page.route("**/api/extension/cards/**", async (route) => {
    await fulfillJson(route, generationStarted ? usableCard : partialCard);
  });
  await page.route("**/api/generate?**", async (route) => {
    await fulfillJson(route, {
      slug: "databricks",
      domain: "databricks.com",
      status: generationStarted ? "complete" : "idle",
      mode: "basics"
    });
  });
  await page.route("**/api/generate", async (route) => {
    generationStarted = true;
    generateRequests.push(route.request().postDataJSON() as { mode?: string });
    await fulfillJson(route, { slug: "databricks", status: "queued", mode: "basics" }, 202);
  });
  await openSidePanel(page);

  await expect(page.getByRole("heading", { name: "Databricks" })).toBeVisible();
  await expect(page.getByLabel("Research layer")).toBeVisible();
  await expect(page.getByText("No cited profile yet")).toHaveCount(0);
  await expect(page.getByText("Not found")).toHaveCount(0);
  expect(generateRequests).toMatchObject([{ mode: "basics" }]);
});

test("core metrics and people stay compact in the company context", async ({ page }) => {
  await installChromeShim(page, { activeDomain: "conductor.build" });
  await mockExtensionApi(page, browserbaseCard({
    domain: "conductor.build",
    identity: {
      ...browserbaseCard().identity,
      name: { value: "Conductor", status: "verified", confidence: "high", citationIds: ["c1"] },
      websiteUrl: { value: "https://conductor.build/", status: "verified", confidence: "high", citationIds: ["c1"] },
      oneLiner: {
        value: "Conductor lets software developers run teams of AI coding agents in parallel.",
        status: "verified",
        confidence: "high",
        citationIds: ["c1"]
      },
      hq: { value: { city: "San Francisco", country: "United States" }, status: "verified", confidence: "medium", citationIds: ["c1"] },
      foundedYear: { value: 2024, status: "verified", confidence: "medium", citationIds: ["c1"] }
    },
    team: {
      founders: {
        value: [
          { name: "Charlie Holtz", role: "Co-founder & CEO", sourceUrl: "https://conductor.build/about" },
          { name: "Jackson de Campos", role: "Co-founder", sourceUrl: "https://conductor.build/about" }
        ],
        status: "verified",
        confidence: "medium",
        citationIds: ["c1"]
      },
      headcount: {
        value: { value: 6, asOf: "2026-04-27" },
        status: "inferred",
        confidence: "low",
        citationIds: ["c2"]
      },
      keyExecs: {
        value: [
          { name: "Charlie Holtz", role: "Founder & CEO (prev. Engineer at Replicate)", sourceUrl: "https://linkedin.com/in/charlie" }
        ],
        status: "verified",
        confidence: "medium",
        citationIds: ["c2"]
      }
    },
    citations: [
      ...browserbaseCard().citations,
      {
        id: "c2",
        url: "https://linkedin.com/company/conductor-build/",
        title: "Conductor LinkedIn",
        fetchedAt: "2026-05-12T12:00:00.000Z",
        sourceType: "enrichment"
      }
    ]
  }));
  await openSidePanel(page);

  const facts = page.getByLabel("Core metrics");
  const management = page.getByLabel("Management team");
  const researchLayer = page.getByLabel("Research layer");
  await expect(facts.getByText("Employees")).toBeVisible();
  await expect(facts.locator("dd").filter({ hasText: /^6$/ })).toBeVisible();
  await expect(facts.getByText("2026-04-27")).toBeVisible();
  await expect(facts.locator("> div").first()).not.toHaveAttribute("aria-describedby", "cs-company-shared-tooltip");
  await expect(management.getByText("Charlie Holtz")).toHaveCount(1);
  await expect(management.getByText("Jackson de Campos")).toBeVisible();
  await expect(management.getByText("2 sources")).toBeVisible();
  await expect(page.locator(".cs-management-team")).toHaveCount(0);

  const charlie = page.locator(".cs-people-person", { hasText: "Charlie Holtz" });
  await expect(charlie).toHaveAttribute("aria-describedby", "cs-company-shared-tooltip");
  await charlie.focus();
  const peopleTooltip = page.locator("#cs-company-shared-tooltip");
  await expect(peopleTooltip).toBeVisible();
  await expect(peopleTooltip).toContainText("Charlie Holtz");
  await expect(peopleTooltip).toContainText("Co-founder & CEO");
  await expect(peopleTooltip).toHaveAttribute("data-placement", "above");

  const factsBox = await facts.boundingBox();
  const managementBox = await management.boundingBox();
  const researchBox = await researchLayer.boundingBox();
  expect(factsBox?.y).toBeLessThan(managementBox?.y ?? 0);
  expect(managementBox?.y).toBeLessThan(researchBox?.y ?? 0);
});

test("missing card shows an explicit generation gate and does not auto-start", async ({ page }) => {
  const generateRequests: string[] = [];
  await installChromeShim(page, { activeDomain: "legora.com" });
  await mockExtensionApi(page, null);
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/api/generate")) {
      generateRequests.push(request.url());
    }
  });

  await openSidePanel(page);

  await expect(page.getByRole("heading", { name: "Legora" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Get up to speed" })).toBeVisible();
  expect(generateRequests).toHaveLength(0);
  await expect(page.locator('input[value="http://localhost:3000"]')).toHaveCount(0);
});

test("running basics progress shows the source-pass run instrument", async ({ page }) => {
  await installChromeShim(page, { activeDomain: "cartesia.ai" });
  await page.route("**/api/extension/bootstrap?**", async (route) => {
    await fulfillJson(route, {
      domain: "cartesia.ai",
      slug: "cartesia",
      card: null,
      runs: {
        basics: {
          slug: "cartesia",
          domain: "cartesia.ai",
          status: "running",
          mode: "basics",
          startedAt: new Date(Date.now() - 30_000).toISOString()
        },
        analysis: { slug: "cartesia", domain: "cartesia.ai", status: "idle", mode: "analysis" }
      }
    });
  });
  await page.route("**/api/extension/cards/**", async (route) => {
    await fulfillJson(route, { error: "card not found" }, 404);
  });
  await page.route("**/api/generate?**", async (route) => {
    await fulfillJson(route, {
      slug: "cartesia",
      domain: "cartesia.ai",
      status: "running",
      mode: "basics",
      startedAt: new Date(Date.now() - 30_000).toISOString()
    });
  });

  await openSidePanel(page);

  await expect(page.getByText("Researching")).toBeVisible();
  await expect(page.locator(".cs-build-bar")).toHaveCount(0);
  await expect(page.locator(".cs-build-tree")).toBeVisible();
  await expect(page.locator(".cs-build-tree")).toContainText("Sources");
  await expect(page.locator(".cs-build-tree")).toContainText("Checking company, product, funding, and proof sources");
  await expect(page.locator(".cs-build-tree")).toContainText("Filed");
  await expect(page.locator(".cs-build-tree")).not.toContainText("Looking for useful places to read");
  await expect(page.locator(".cs-build-tree")).not.toContainText("Pulling in what matters");
  await expect(page.locator(".cs-build-tree")).not.toContainText("Turning evidence into a card");
  await expect(page.locator(".cs-build-tree")).not.toContainText("Saving the final profile");
  // No wall-clock estimation: with no run events, progress holds at the first stage.
  await expect(page.locator(".cs-build-meta")).toContainText("Step 1 of 4");
  // Prove the Drizzle loader is actually changing over time, not just declared.
  const drizzlePixel = page.locator(".cs-drizzle-loader span").first();
  await expect(drizzlePixel).toHaveCSS("animation-name", "cs-drizzle-step");
  const samples: number[] = [];
  for (let i = 0; i < 3; i += 1) {
    samples.push(Math.round(Number(await drizzlePixel.evaluate((el) => getComputedStyle(el).opacity)) * 100));
    if (i < 2) {
      await page.waitForTimeout(420);
    }
  }
  expect(new Set(samples).size, `Drizzle opacity should change over time, got ${JSON.stringify(samples)}`).toBeGreaterThan(1);
});

test("progress tree surfaces real research events as substeps", async ({ page }) => {
  await installChromeShim(page, { activeDomain: "cartesia.ai" });
  const startedAt = new Date(Date.now() - 12_000).toISOString();
  const events = [
    { id: "e1", runId: "r1", slug: "cartesia", domain: "cartesia.ai", sectionId: null, type: "plan.ready", message: "Research plan ready", metadata: {}, createdAt: "2026-06-01T00:00:01.000Z" },
    { id: "e2", runId: "r1", slug: "cartesia", domain: "cartesia.ai", sectionId: null, type: "source.found", message: "Found 12 accepted sources", metadata: { acceptedCount: 12 }, createdAt: "2026-06-01T00:00:03.000Z" },
    { id: "e3", runId: "r1", slug: "cartesia", domain: "cartesia.ai", sectionId: null, type: "card.partial", message: "Saved first usable company card", metadata: { citationCount: 7 }, createdAt: "2026-06-01T00:00:05.000Z" },
    { id: "e4", runId: "r1", slug: "cartesia", domain: "cartesia.ai", sectionId: null, type: "contacts.started", message: "Started async contact enrichment", metadata: {}, createdAt: "2026-06-01T00:00:06.000Z" }
  ];
  await page.route("**/api/extension/bootstrap?**", async (route) => {
    await fulfillJson(route, {
      domain: "cartesia.ai",
      slug: "cartesia",
      card: null,
      events,
      runs: {
        basics: { slug: "cartesia", domain: "cartesia.ai", status: "running", mode: "basics", startedAt, events },
        analysis: { slug: "cartesia", domain: "cartesia.ai", status: "idle", mode: "analysis" }
      }
    });
  });
  await page.route("**/api/extension/cards/**", async (route) => {
    await fulfillJson(route, { error: "card not found" }, 404);
  });
  await page.route("**/api/generate?**", async (route) => {
    await fulfillJson(route, { slug: "cartesia", domain: "cartesia.ai", status: "running", mode: "basics", startedAt, events });
  });

  await openSidePanel(page);

  const tree = page.locator(".cs-build-tree");
  await expect(tree).toBeVisible({ timeout: 10_000 });
  await expect(tree).not.toContainText("Picked a research plan");
  await expect(tree).toContainText("12 sources found");
  await expect(tree).toContainText("First cited profile ready - 7 citations");
  await expect(tree).not.toContainText("Started async contact enrichment");
  await expect(page.locator(".cs-build-substeps li").filter({ hasText: "First cited profile ready" })).toHaveCount(0);
});

test("reduced motion keeps progress readable without sweeping motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installChromeShim(page, { activeDomain: "cartesia.ai" });
  await page.route("**/api/extension/bootstrap?**", async (route) => {
    await fulfillJson(route, {
      domain: "cartesia.ai",
      slug: "cartesia",
      card: null,
      runs: {
        basics: {
          slug: "cartesia",
          domain: "cartesia.ai",
          status: "running",
          mode: "basics",
          startedAt: new Date(Date.now() - 30_000).toISOString()
        },
        analysis: { slug: "cartesia", domain: "cartesia.ai", status: "idle", mode: "analysis" }
      }
    });
  });
  await page.route("**/api/extension/cards/**", async (route) => {
    await fulfillJson(route, { error: "card not found" }, 404);
  });
  await page.route("**/api/generate?**", async (route) => {
    await fulfillJson(route, {
      slug: "cartesia",
      domain: "cartesia.ai",
      status: "running",
      mode: "basics",
      startedAt: new Date(Date.now() - 30_000).toISOString()
    });
  });

  await openSidePanel(page);

  await expect(page.locator(".cs-build-bar")).toHaveCount(0);
  await expect(page.locator(".cs-build-tree")).toBeVisible();
  await expect(page.locator(".cs-build-meta")).toContainText("Step 1 of 4");
  const drizzlePixel = page.locator(".cs-drizzle-loader span").first();
  // Reduced motion is a reduction, not a freeze: the loader breathes in place
  // instead of stepping spatially.
  await expect(drizzlePixel).toHaveCSS("animation-name", "cs-reduced-breathe");
  await expect(page.locator(".cs-plan-status[data-status='running']").first()).toBeVisible();
});

test("reduced motion keeps the research stack legible and still", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installChromeShim(page);
  await mockExtensionApi(page, browserbaseCardWithSynthesis());
  await openSidePanel(page);

  const stack = page.getByLabel("Research card stack");
  const topCard = page.locator(".cs-dormant-card").first();
  await expect(stack).toBeVisible();
  await expect(topCard).toBeVisible();
  await expect(topCard).toHaveCSS("animation-name", "none");
  await expect(page.locator(".cs-dormant-card-frame").first()).toHaveCSS("animation-name", "none");
  await page.screenshot({ fullPage: true, path: "/private/tmp/cold-start-reduced-motion-rest.png" });
});

test("dragging a dormant card opens a real insertion slot before release", async ({ page }) => {
  const generationRequests: Array<{ confirmStart?: boolean; domain?: string; mode?: string; sectionId?: string }> = [];
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await installChromeShim(page);
  await mockExtensionApi(page, browserbaseCard());
  page.on("request", (request) => {
    if (request.method() !== "POST" || !request.url().endsWith("/api/generate")) {
      return;
    }
    generationRequests.push(request.postDataJSON() as { confirmStart?: boolean; domain?: string; mode?: string; sectionId?: string });
  });
  await openSidePanel(page);

  const card = page.locator(".cs-dormant-card", { hasText: "Next question" });
  await expect(card).toBeVisible();

  const box = await card.boundingBox();
  expect(box).not.toBeNull();
  if (!box) {
    return;
  }

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 48, { steps: 8 });
  const insertionSlot = page.locator(".cs-module-insertion-slot");
  await expect(insertionSlot).toBeVisible();
  await expect(insertionSlot).toContainText("File Next question");
  await expect(insertionSlot).toHaveAttribute("data-ready", "false");
  await expect(page.locator(".cs-drop-zone")).toHaveCount(0);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 232, { steps: 12 });
  await expect(insertionSlot).toHaveAttribute("data-ready", "true");
  await page.mouse.up();

  const activeQuestions = page.locator(".cs-active-enrichment", { hasText: "Next question" });
  await expect(activeQuestions).toBeVisible();
  // Synthesis-backed cards never auto-fire a section run on filing; they open the
  // investor-lens gate and wait for an explicit Queue.
  await expect(activeQuestions).toContainText("Activate the investor lens");
  expect(generationRequests).toHaveLength(0);
  await activeQuestions.getByRole("button", { name: "Queue" }).click();
  await expect.poll(() => generationRequests).toMatchObject([
    { confirmStart: true, domain: "browserbase.com", mode: "analysis", sectionId: "risks" }
  ]);
});

test("dormant card drag stays attached across pile depth", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await installChromeShim(page);
  await mockExtensionApi(page, browserbaseCardWithSynthesis());
  await openSidePanel(page);

  for (const scenario of [
    {
      deltas: [
        { label: "initial", y: -12 },
        { label: "mid", y: -42 },
        { label: "ready", y: -116 }
      ],
      label: "Who pays",
      slug: "first"
    },
    {
      deltas: [
        { label: "initial", y: -24 },
        { label: "mid", y: -96 },
        { label: "ready", y: -180 }
      ],
      label: "Money",
      slug: "middle"
    },
    {
      deltas: [
        { label: "initial", y: -32 },
        { label: "mid", y: -140 },
        { label: "ready", y: -248 }
      ],
      label: "Product",
      slug: "last"
    }
  ] as const) {
    const card = page.locator(".cs-dormant-card", { hasText: scenario.label });
    await card.scrollIntoViewIfNeeded();
    await expect(card).toBeVisible();

    const samples = await dragWithSamples({
      card,
      deltas: scenario.deltas,
      page,
      screenshotPrefix: `cold-start-drag-${scenario.slug}`
    });
    expectPointerAttached(samples);
    await page.mouse.up();
    await expect(page.locator(".cs-active-enrichment", { hasText: scenario.label })).toBeVisible();
    await expect(page.locator(".cs-dormant-card", { hasText: scenario.label })).toHaveCount(0);
  }
});

test("short dormant-card drag settles without click activation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await installChromeShim(page);
  await mockExtensionApi(page, browserbaseCardWithSynthesis());
  await openSidePanel(page);

  const card = page.locator(".cs-dormant-card", { hasText: "Who pays" });
  await expect(card).toBeVisible();

  const box = await card.boundingBox();
  expect(box).not.toBeNull();
  if (!box) {
    return;
  }

  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX, startY - 24, { steps: 8 });
  await page.mouse.up();

  await expect(page.locator(".cs-module-insertion-slot")).toHaveCount(0);
  await expect(page.locator(".cs-dormant-card", { hasText: "Who pays" })).toBeVisible();
  await expect(page.locator(".cs-active-enrichment", { hasText: "Who pays" })).toHaveCount(0);
});

test("active research cards keep one module open at a time", async ({ page }) => {
  const emptySignalsCard = browserbaseCard({ signals: [] });
  await installChromeShim(page);
  await mockExtensionApi(page, emptySignalsCard);
  await page.route("**/api/generate?**", async (route) => {
    await fulfillJson(route, {
      slug: "browserbase",
      domain: "browserbase.com",
      status: "running",
      mode: "basics",
      startedAt: new Date(Date.now() - 14_000).toISOString()
    });
  });
  await openSidePanel(page);

  const dormantSignals = page.locator(".cs-dormant-card", { hasText: "Signals" });
  await dormantSignals.focus();
  await page.keyboard.press("Enter");

  const activeSignals = page.locator('.cs-active-enrichment[data-layer-id="signals"]');
  const signalsHeader = activeSignals.locator(".cs-active-enrichment-head");
  const signalsBody = activeSignals.locator(".cs-active-enrichment-body-frame");
  await expect(activeSignals).toHaveAttribute("data-state", "running");
  await expect(activeSignals).toHaveAttribute("data-expanded", "true");
  await expect(signalsHeader).toHaveAttribute("aria-expanded", "true");
  await expect(activeSignals).toContainText("Refreshing");
  await expect(activeSignals).toContainText("Checking recent traction");
  await expect(activeSignals.locator(".cs-layer-running-sheen")).toHaveCSS("animation-name", "cs-layer-sheen-slide");
  await expect(activeSignals.locator(".cs-layer-running-sheen")).not.toHaveCSS("background-image", "none");
  // Running text itself is solid and readable, not a clipped gradient.
  await expect(activeSignals.locator(".cs-layer-running-text")).toHaveCSS("background-image", "none");

  await signalsHeader.click();

  await expect(activeSignals).toHaveAttribute("data-expanded", "true");
  await expect(signalsHeader).toHaveAttribute("aria-expanded", "true");
  await expect(signalsBody).toHaveAttribute("data-expanded", "true");

  const dormantServes = page.locator(".cs-dormant-card", { hasText: "Who pays" });
  await dormantServes.click();
  const activeServes = page.locator('.cs-active-enrichment[data-layer-id="serves"]');
  await expect(activeServes).toHaveAttribute("data-expanded", "true");
  await expect(activeSignals).toHaveAttribute("data-expanded", "false");
  await expect(page.locator(".cs-dormant-card", { hasText: "Who pays" })).toHaveCount(0);
  await page.screenshot({ fullPage: true, path: "/private/tmp/cold-start-active-transition.png" });
});

async function openReadyProfileWithActiveBasics(page: Parameters<typeof installChromeShim>[0]) {
  await installChromeShim(page, { activeDomain: "browserbase.com" });
  const startedAt = new Date(Date.now() - 32_000).toISOString();
  const events = [
    { id: "profile-e1", runId: "profile-r1", slug: "browserbase", domain: "browserbase.com", sectionId: null, type: "plan.ready", message: "Research plan ready", metadata: { mode: "basics" }, createdAt: "2026-06-01T00:00:01.000Z" },
    { id: "profile-e2", runId: "profile-r1", slug: "browserbase", domain: "browserbase.com", sectionId: null, type: "source.found", message: "Found 5 accepted sources", metadata: { mode: "basics", acceptedCount: 5 }, createdAt: "2026-06-01T00:00:03.000Z" },
    { id: "profile-e3", runId: "profile-r1", slug: "browserbase", domain: "browserbase.com", sectionId: null, type: "card.partial", message: "Saved first usable company card", metadata: { mode: "basics", citationCount: 4 }, createdAt: "2026-06-01T00:00:05.000Z" },
    { id: "analysis-e1", runId: "analysis-r1", slug: "browserbase", domain: "browserbase.com", sectionId: null, type: "generation.started", message: "Started analysis generation", metadata: { mode: "analysis" }, createdAt: "2026-06-01T00:00:06.000Z" }
  ];
  const sources = [
    {
      id: "source-1",
      url: "https://browserbase.com/",
      title: "Browserbase",
      domain: "browserbase.com",
      sourceType: "company_site",
      fetchedAt: "2026-06-01T00:00:03.000Z",
      snippet: "Browserbase turns browser automation into agent infrastructure."
    }
  ];
  await page.route("**/api/extension/bootstrap?**", async (route) => {
    await fulfillJson(route, {
      domain: "browserbase.com",
      slug: "browserbase",
      card: browserbaseCard(),
      sections: [],
      events,
      sources,
      runs: {
        basics: { slug: "browserbase", domain: "browserbase.com", mode: "basics", status: "running", startedAt, events },
        analysis: { slug: "browserbase", domain: "browserbase.com", mode: "analysis", status: "idle" }
      }
    });
  });
  await page.route("**/api/extension/cards/**", async (route) => {
    await fulfillJson(route, browserbaseCard());
  });
  // Keep basics running after card.partial to prove readiness no longer waits for final enrichment.
  await page.route("**/api/generate?**", async (route) => {
    await fulfillJson(route, {
      slug: "browserbase",
      domain: "browserbase.com",
      status: "running",
      mode: "basics",
      startedAt,
      events
    });
  });
  await page.goto("/sidepanel.html");
}

test("card.partial makes the starter profile usable while basics finalizes", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await openReadyProfileWithActiveBasics(page);

  await expect(page.getByRole("heading", { name: "Browserbase" })).toBeVisible();
  const profileProgress = page.locator(".cs-research-progress");
  await expect(profileProgress).toHaveAttribute("data-mode", "receipt");
  await expect(profileProgress).toContainText("Starter profile ready");
  await expect(profileProgress).toContainText("Filling in contacts/details");
  await expect(profileProgress).toContainText("5 sources");
  await profileProgress.getByRole("button", { name: "Details" }).click();
  await expect(profileProgress).toContainText("Starter profile ready");
  await expect(profileProgress).not.toContainText("Saved a starter profile");
  await expect(profileProgress).not.toContainText("Also:");
  await expect(page.locator(".cs-active-enrichment[data-state='running']")).toHaveCount(0);
  await expect(page.getByText("Getting the profile ready")).toHaveCount(0);
  await expect(page.getByText("Finishing profile")).toHaveCount(0);
  await expect(page.locator(".cs-dormant-card", { hasText: "Why care" })).toBeVisible();
  await page.screenshot({ fullPage: true, path: "/private/tmp/cold-start-starter-profile-ready.png" });
});

test("starter profile readiness does not show profile-finishing motion under reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openReadyProfileWithActiveBasics(page);

  await expect(page.locator(".cs-active-enrichment[data-state='running']")).toHaveCount(0);
  await expect(page.locator(".cs-layer-running-sheen")).toHaveCount(0);
  await expect(page.getByText("Getting the profile ready")).toHaveCount(0);
});

test("keyboard activation queues synthesis-backed cards", async ({ page }) => {
  const generationRequests: Array<{ confirmStart?: boolean; domain?: string; mode?: string; sectionId?: string }> = [];
  await installChromeShim(page);
  await mockExtensionApi(page, browserbaseCard());
  page.on("request", (request) => {
    if (request.method() !== "POST" || !request.url().endsWith("/api/generate")) {
      return;
    }
    generationRequests.push(request.postDataJSON() as { confirmStart?: boolean; domain?: string; mode?: string; sectionId?: string });
  });
  await openSidePanel(page);

  const openQuestions = page.locator(".cs-dormant-card", { hasText: "Next question" });
  await openQuestions.focus();
  await page.keyboard.press("Enter");

  // Keyboard filing opens the lens gate; the explicit Queue action starts the run.
  const activeQuestions = page.locator(".cs-active-enrichment", { hasText: "Next question" });
  await expect(activeQuestions).toContainText("Activate the investor lens");
  expect(generationRequests).toHaveLength(0);
  await activeQuestions.getByRole("button", { name: "Queue" }).click();
  await expect(activeQuestions).toContainText("Synthesizing");
  await expect.poll(() => generationRequests).toMatchObject([
    { confirmStart: true, domain: "browserbase.com", mode: "analysis", sectionId: "risks" }
  ]);

  const marketCard = page.locator(".cs-dormant-card", { hasText: "Timing" });
  await marketCard.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".cs-active-enrichment", { hasText: "Timing" })).toContainText("Queued");
  await expect.poll(() => generationRequests).toHaveLength(1);
});
