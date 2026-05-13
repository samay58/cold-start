import { expect, test } from "@playwright/test";
import {
  browserbaseCard,
  browserbaseCardWithSynthesis,
  installChromeShim,
  mockExtensionApi
} from "./fixtures";

async function openSidePanel(page: Parameters<typeof installChromeShim>[0]) {
  await page.goto("/sidepanel.html");
  await expect(page.getByText("Cold Start").first()).toBeVisible();
}

test("cached card renders the research layer without old analyze affordances", async ({ page }) => {
  await installChromeShim(page);
  await mockExtensionApi(page, browserbaseCardWithSynthesis());
  await openSidePanel(page);

  await expect(page.getByRole("heading", { name: "Browserbase" })).toBeVisible();
  await expect(page.getByText("Research layer")).toBeVisible();
  await expect(page.getByText("Browserbase turns browser automation into agent infrastructure")).toBeVisible();
  await expect(page.getByRole("link", { name: "browserbase.com" })).toHaveAttribute("target", "_blank");
  await expect(page.getByText("[c1]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Analyze" })).toHaveCount(0);
});

test("core metrics and management stay in the company dossier", async ({ page }) => {
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
  await expect(facts.getByText("As of 2026-04-27")).toBeVisible();
  await expect(management.getByText("Charlie Holtz")).toHaveCount(1);
  await expect(management.getByText("Jackson de Campos")).toBeVisible();
  await expect(management.getByText("2 sources")).toBeVisible();

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

  await expect(page.getByRole("heading", { name: "Generate Legora?" })).toBeVisible();
  expect(generateRequests).toHaveLength(0);
  await expect(page.locator('input[value="http://localhost:3000"]')).toHaveCount(0);
});

test("dragging a dormant card upward snaps it into the active research layer", async ({ page }) => {
  await installChromeShim(page);
  await mockExtensionApi(page, browserbaseCard());
  await openSidePanel(page);

  const card = page.locator(".cs-dormant-card", { hasText: "Customers" });
  await expect(card).toBeVisible();

  const box = await card.boundingBox();
  expect(box).not.toBeNull();
  if (!box) {
    return;
  }

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 120, { steps: 8 });
  await expect(page.getByText("Release to pin")).toBeVisible();
  await page.mouse.up();

  const activeCustomers = page.locator(".cs-active-enrichment", { hasText: "Customers" });
  await expect(activeCustomers).toBeVisible();
  await expect(activeCustomers).toContainText("AI application developers and automation teams");
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

  const openQuestions = page.locator(".cs-dormant-card", { hasText: "Open Questions" });
  await openQuestions.focus();
  await page.keyboard.press("Enter");

  await expect(page.locator(".cs-active-enrichment", { hasText: "Open Questions" })).toContainText("Synthesizing");
  expect(generationRequests).toMatchObject([
    { confirmStart: true, domain: "browserbase.com", mode: "analysis" }
  ]);
});
