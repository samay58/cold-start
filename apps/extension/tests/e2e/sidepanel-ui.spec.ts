import { expect, test } from "@playwright/test";
import {
  browserbaseCard,
  browserbaseCardWithSynthesis,
  fulfillJson,
  installChromeShim,
  mockExtensionApi
} from "./fixtures";

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
  await expect(page.getByText("Browserbase turns browser automation into agent infrastructure")).toBeVisible();
  await expect(page.getByLabel("Company context").getByRole("link", { name: "browserbase.com" })).toHaveAttribute("target", "_blank");
  await expect(page.getByText("[c1]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Analyze" })).toHaveCount(0);
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
  await expect(management.getByText("Charlie Holtz")).toHaveCount(1);
  await expect(management.getByText("Jackson de Campos")).toBeVisible();
  await expect(management.getByText("2 sources")).toBeVisible();
  await expect(page.locator(".cs-management-team")).toHaveCount(0);

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
  await expect(page.getByRole("heading", { name: "know it all" })).toBeVisible();
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

  await expect(page.getByText("Building")).toBeVisible();
  await expect(page.locator(".cs-source-pass-now")).toContainText("Citations");
  await expect(page.locator(".cs-run-steps").getByText("Citations")).toBeVisible();
  await expect(page.locator(".cs-run-steps li[aria-current='step']")).toContainText("Citations");
  await expect(page.locator(".cs-source-pass-rail")).toBeVisible();
  await expect(page.locator(".cs-live-progress-track")).toBeVisible();
  await expect(page.locator(".cs-live-progress-scan")).toBeVisible();
});

test("reduced motion keeps progress readable without scan or pulse animation", async ({ page }) => {
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

  await expect(page.locator(".cs-live-progress-track")).toBeVisible();
  await expect(page.locator(".cs-run-steps li[aria-current='step']")).toContainText("Citations");
  await expect(page.locator(".cs-live-progress-scan")).toBeHidden();
  await expect(page.locator(".cs-live-progress-cursor")).toHaveCSS("animation-name", "none");
  await expect(page.locator(".cs-source-pass-now")).toContainText("Citations");
});

test("dragging a dormant card upward snaps it into the active research layer", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await installChromeShim(page);
  await mockExtensionApi(page, browserbaseCard());
  await openSidePanel(page);

  const card = page.locator(".cs-dormant-card", { hasText: "Questions" });
  await expect(card).toBeVisible();

  const box = await card.boundingBox();
  expect(box).not.toBeNull();
  if (!box) {
    return;
  }

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 34, { steps: 4 });
  await expect(page.getByText("Lift to commit")).toBeVisible();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 120, { steps: 8 });
  await expect(page.getByText("Release to pin")).toBeVisible();
  await page.mouse.up();

  const activeQuestions = page.locator(".cs-active-enrichment", { hasText: "Questions" });
  await expect(activeQuestions).toBeVisible();
  await expect(activeQuestions).toContainText("Synthesizing");
});

test("running card enrichment can be collapsed without stopping the refresh signal", async ({ page }) => {
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
  await expect(activeSignals).toContainText("Searching for recent traction and launch signals");

  await signalsHeader.click();

  await expect(activeSignals).toHaveAttribute("data-state", "running");
  await expect(activeSignals).toHaveAttribute("data-expanded", "false");
  await expect(signalsHeader).toHaveAttribute("aria-expanded", "false");
  await expect(signalsBody).toHaveAttribute("data-expanded", "false");
  await expect(signalsHeader).toContainText("Refreshing");
});

test("keyboard activation starts analysis for synthesis-backed cards only", async ({ page }) => {
  const generationRequests: Array<{ mode?: string }> = [];
  await installChromeShim(page);
  await mockExtensionApi(page, browserbaseCard());
  page.on("request", (request) => {
    if (request.method() !== "POST" || !request.url().endsWith("/api/generate")) {
      return;
    }
    generationRequests.push(request.postDataJSON() as { mode?: string });
  });
  await openSidePanel(page);

  const openQuestions = page.locator(".cs-dormant-card", { hasText: "Questions" });
  await openQuestions.focus();
  await page.keyboard.press("Enter");

  await expect(page.locator(".cs-active-enrichment", { hasText: "Questions" })).toContainText("Synthesizing");
  expect(generationRequests).toMatchObject([
    { confirmStart: true, domain: "browserbase.com", mode: "analysis" }
  ]);
});
