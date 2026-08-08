import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

import {
  fulfillJson,
  installChromeShim,
  mockExtensionApi
} from "../../extension/tests/e2e/fixtures";
import { readFullCard } from "../../extension/tests/e2e/lens-gallery-fixtures";

const OUTPUT_DIR = fileURLToPath(new URL("../public/product", import.meta.url));
const card = readFullCard();

test.beforeAll(() => {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
});

async function openPanel(page: Page) {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.addInitScript(() => {
    localStorage.setItem("coldStartThemeEffective", "light");
    localStorage.setItem("coldStartThemePreference", "light");
  });
  await page.goto("/sidepanel.html");
  await expect(page.locator("#root > *")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Baseten" })).toBeVisible();
  await page.waitForTimeout(300);
}

async function mockRunningProfile(page: Page, events: Array<Record<string, unknown>>) {
  const startedAt = new Date(Date.now() - 30_000).toISOString();
  await installChromeShim(page, { activeDomain: card.domain });
  await page.route("**/api/extension/bootstrap?**", async (route) => {
    await fulfillJson(route, {
      card: null,
      domain: card.domain,
      events,
      runs: {
        analysis: { domain: card.domain, mode: "analysis", slug: card.slug, status: "idle" },
        basics: { domain: card.domain, events, mode: "basics", slug: card.slug, startedAt, status: "running" }
      },
      slug: card.slug
    });
  });
  await page.route("**/api/extension/cards/**", async (route) => {
    await fulfillJson(route, { error: "card not found" }, 404);
  });
  await page.route("**/api/generate?**", async (route) => {
    await fulfillJson(route, {
      domain: card.domain,
      events,
      mode: "basics",
      slug: card.slug,
      startedAt,
      status: "running"
    });
  });
}

test("captures the Baseten intake", async ({ page }) => {
  await installChromeShim(page, { activeDomain: card.domain });
  await mockExtensionApi(page, null);
  await openPanel(page);
  await expect(page.getByRole("button", { name: "Begin research" })).toBeVisible();
  await page.screenshot({ fullPage: true, path: path.join(OUTPUT_DIR, "intake.png") });
});

test("captures Baseten sources arriving", async ({ page }) => {
  const sources = card.citations.slice(2, 5).map((citation) => ({
    domain: new URL(citation.url).hostname.replace(/^www\./, ""),
    imageUrl: null,
    sourceType: citation.sourceType,
    title: citation.title,
    url: citation.url
  }));
  const events = [{
    createdAt: "2026-07-20T15:22:14.463Z",
    domain: card.domain,
    id: "source-1",
    message: "Found 3 accepted sources",
    metadata: { acceptedCount: 3, sources },
    runId: "video-basics",
    sectionId: null,
    slug: card.slug,
    type: "source.found"
  }];

  await mockRunningProfile(page, events);
  await openPanel(page);
  await expect(page.locator(".cs-clipping")).toHaveCount(3);
  await page.screenshot({ fullPage: true, path: path.join(OUTPUT_DIR, "sources.png") });
});

test("captures the Baseten early read", async ({ page }) => {
  const companyCitation = card.citations.find((citation) => citation.sourceType === "company_site");
  const newsCitation = card.citations.find((citation) => citation.sourceType === "news");
  if (!companyCitation || !newsCitation) {
    throw new Error("The Baseten fixture needs company and news citations.");
  }
  const firstPayoff = {
    domain: card.domain,
    entityConfidence: "high",
    entityConfidenceReason: "Company-controlled source matches the current domain.",
    evidenceSoFar: [companyCitation, newsCitation].map((citation) => ({
      arrivedAtMs: Date.now(),
      domain: new URL(citation.url).hostname.replace(/^www\./, ""),
      entityMatched: true,
      quality: citation.sourceType === "company_site" ? "company" : "reported",
      sourceClass: citation.sourceType === "company_site" ? "company_site" : "funding",
      sourceId: citation.id,
      title: citation.title,
      url: citation.url
    })),
    generatedAt: new Date().toISOString(),
    generatedAtMs: Date.now(),
    slug: card.slug,
    status: "substantive_first_read",
    stillChecking: { missingEvidenceClass: "customer_proof", text: "Named customer proof." },
    suppressionReasons: [],
    whatItDoes: {
      citationIds: [],
      claimKind: "what_it_does",
      sourceClass: "company_site",
      sourceIds: [companyCitation.id],
      supportingText: card.identity.oneLiner.value,
      text: card.identity.oneLiner.value
    }
  };
  const events = [
    {
      createdAt: "2026-07-20T15:22:14.463Z",
      domain: card.domain,
      id: "source-1",
      message: "Found 9 accepted sources",
      metadata: { acceptedCount: 9 },
      runId: "video-basics",
      sectionId: null,
      slug: card.slug,
      type: "source.found"
    },
    {
      createdAt: "2026-07-20T15:22:18.463Z",
      domain: card.domain,
      id: "read-1",
      message: "Early read ready",
      metadata: { firstPayoff },
      runId: "video-basics",
      sectionId: null,
      slug: card.slug,
      type: "first_payoff.ready"
    }
  ];

  await mockRunningProfile(page, events);
  await openPanel(page);
  await expect(page.getByLabel("Early read")).toBeVisible();
  await page.screenshot({ fullPage: true, path: path.join(OUTPUT_DIR, "early-read.png") });
});

test("captures the filed Baseten profile", async ({ page }) => {
  await installChromeShim(page, { activeDomain: card.domain });
  await mockExtensionApi(page, card);
  await openPanel(page);
  await expect(page.getByRole("article", { name: "Investor read" })).toBeVisible();
  await page.screenshot({ fullPage: true, path: path.join(OUTPUT_DIR, "profile.png") });
});
