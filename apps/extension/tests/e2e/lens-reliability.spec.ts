import { createRequire } from "node:module";
import type { ColdStartCard } from "@cold-start/core";
import { expect, test, type Page, type Route } from "@playwright/test";
import { fulfillJson, installChromeShim } from "./fixtures";
import { readyCard, readFullCard } from "./lens-gallery-fixtures";

const require = createRequire(import.meta.url);
const contract = require("@cold-start/core/api-contract.json") as { apiHeader: string; version: string };
const COLD_START_API_CONTRACT_HEADER = contract.apiHeader;
const COLD_START_API_CONTRACT_VERSION = contract.version;

async function openSidePanel(page: Page) {
  await page.goto("/sidepanel.html");
  await expect(page.locator("#root > *")).toHaveCount(1);
}

async function installReadyAnalysis(
  page: Page,
  input: {
    onPost?: () => void;
    cardAfterPost?: ColdStartCard;
    postStatus?: "cached" | "queued";
  } = {}
) {
  const initialCard = readyCard();
  let started = false;
  await installChromeShim(page, { activeDomain: initialCard.domain });
  await page.route("**/api/extension/bootstrap?**", async (route) => {
    await fulfillJson(route, {
      domain: initialCard.domain,
      slug: initialCard.slug,
      card: initialCard,
      runs: {
        basics: { slug: initialCard.slug, domain: initialCard.domain, mode: "basics", status: "complete" },
        analysis: { slug: initialCard.slug, domain: initialCard.domain, mode: "analysis", status: "idle" }
      }
    });
  });
  await page.route("**/api/extension/cards/**", async (route) => {
    await fulfillJson(route, started && input.cardAfterPost ? input.cardAfterPost : initialCard);
  });
  await page.route("**/api/generate**", async (route) => {
    if (route.request().method() === "POST") {
      started = true;
      input.onPost?.();
      await fulfillJson(route, {
        slug: initialCard.slug,
        domain: initialCard.domain,
        mode: "analysis",
        status: input.postStatus ?? "cached"
      });
      return;
    }
    await fulfillJson(route, {
      slug: initialCard.slug,
      domain: initialCard.domain,
      mode: "analysis",
      status: started ? "complete" : "idle"
    });
  });
}

async function installEntranceSampler(page: Page) {
  await page.evaluate(() => {
    const samples: Array<{ opacity: number; transform: string }> = [];
    Object.assign(window, { __coldStartLensEntranceSamples: samples });
    let sampling = false;
    const observer = new MutationObserver(() => {
      const lede = document.querySelector<HTMLElement>(".cs-investor-read-lede");
      if (!lede || sampling) {
        return;
      }
      sampling = true;
      let frames = 0;
      const sample = () => {
        const style = getComputedStyle(lede);
        samples.push({ opacity: Number(style.opacity), transform: style.transform });
        frames += 1;
        if (frames < 48) {
          requestAnimationFrame(sample);
        }
      };
      sample();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
}

async function entranceSamples(page: Page) {
  return page.evaluate(() => (
    window as typeof window & {
      __coldStartLensEntranceSamples?: Array<{ opacity: number; transform: string }>;
    }
  ).__coldStartLensEntranceSamples ?? []);
}

async function installSealProgression(page: Page) {
  const card = readyCard();
  let advanced = false;
  const sourceEvent = {
    id: "source-1",
    runId: "basics-seal-run",
    slug: card.slug,
    domain: card.domain,
    sectionId: null,
    type: "source.found",
    message: "Found 3 accepted sources",
    metadata: { acceptedCount: 3 },
    createdAt: "2026-07-23T16:00:00.000Z"
  };

  await installChromeShim(page, { activeDomain: card.domain });
  await page.route("**/api/extension/bootstrap?**", async (route) => {
    await fulfillJson(route, {
      domain: card.domain,
      slug: card.slug,
      card: null,
      runs: {
        basics: { slug: card.slug, domain: card.domain, mode: "basics", status: "idle" },
        analysis: { slug: card.slug, domain: card.domain, mode: "analysis", status: "idle" }
      }
    });
  });
  await page.route("**/api/extension/cards/**", async (route) => {
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": COLD_START_API_CONTRACT_HEADER,
        [COLD_START_API_CONTRACT_HEADER]: COLD_START_API_CONTRACT_VERSION
      },
      body: JSON.stringify({ error: "Card not found." })
    });
  });
  await page.route("**/api/generate**", async (route) => {
    if (route.request().method() === "POST") {
      await fulfillJson(route, {
        slug: card.slug,
        domain: card.domain,
        mode: "basics",
        status: "queued"
      }, 202);
      return;
    }

    await fulfillJson(route, {
      slug: card.slug,
      domain: card.domain,
      mode: "basics",
      status: "running",
      events: advanced ? [sourceEvent] : []
    });
  });

  return () => {
    advanced = true;
  };
}

test("a cached synthesis response files the memo without a polling detour", async ({ page }) => {
  let postCount = 0;
  await installReadyAnalysis(page, {
    cardAfterPost: readFullCard(),
    onPost: () => {
      postCount += 1;
    }
  });
  await openSidePanel(page);

  await page.getByRole("button", { name: "Run Investor Lens" }).click();
  await expect(page.getByRole("article", { name: "Investor read" })).toBeVisible();
  await expect(page.getByLabel("Investor Lens running")).toHaveCount(0);
  expect(postCount).toBe(1);
});

test("a cached card renders at rest without replaying the memo entrance", async ({ page }) => {
  const card = readFullCard();
  await installChromeShim(page, { activeDomain: card.domain });
  await page.route("**/api/extension/bootstrap?**", async (route) => {
    await fulfillJson(route, {
      domain: card.domain,
      slug: card.slug,
      card,
      runs: {
        basics: { slug: card.slug, domain: card.domain, mode: "basics", status: "complete" },
        analysis: { slug: card.slug, domain: card.domain, mode: "analysis", status: "complete" }
      }
    });
  });
  await page.route("**/api/extension/cards/**", async (route) => {
    await fulfillJson(route, card);
  });
  await openSidePanel(page);

  const lede = page.locator(".cs-investor-read-lede");
  await expect(lede).toBeVisible();
  const resting = await lede.evaluate((node) => {
    const style = getComputedStyle(node);
    return { animations: node.getAnimations().length, opacity: style.opacity, transform: style.transform };
  });
  expect(resting.opacity).toBe("1");
  expect(resting.transform).toBe("none");
  expect(resting.animations).toBe(0);
});

for (const reducedMotion of [false, true]) {
  test(`live filing visibly enters with ${reducedMotion ? "reduced" : "full"} motion`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: reducedMotion ? "reduce" : "no-preference" });
    await installReadyAnalysis(page, { cardAfterPost: readFullCard() });
    await openSidePanel(page);
    await installEntranceSampler(page);

    await page.getByRole("button", { name: "Run Investor Lens" }).click();
    await expect(page.getByRole("article", { name: "Investor read" })).toBeVisible();
    await page.waitForTimeout(850);

    const samples = await entranceSamples(page);
    expect(samples.length).toBeGreaterThan(2);
    expect(samples.some((sample) => sample.opacity < 0.95)).toBe(true);
    expect(samples.at(-1)?.opacity).toBeGreaterThan(0.99);
    if (reducedMotion) {
      expect(samples.every((sample) => sample.transform === "none")).toBe(true);
    } else {
      expect(samples.some((sample) => sample.transform !== "none")).toBe(true);
    }
  });
}

for (const reducedMotion of [false, true]) {
  test(`the seal responds to real events with ${reducedMotion ? "reduced" : "full"} motion`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: reducedMotion ? "reduce" : "no-preference" });
    const advanceSeal = await installSealProgression(page);
    await openSidePanel(page);

    await page.getByRole("button", { name: "Begin research" }).click();
    const seal = page.locator(".cs-seal-inst");
    const fill = page.locator(".cs-seal-inst-fill");
    await expect(seal).toHaveAttribute("data-level", "0");
    const before = await fill.evaluate((node) => {
      const style = getComputedStyle(node);
      return { opacity: Number(style.opacity), transform: style.transform };
    });
    await page.evaluate(() => {
      const samples: Array<{ opacity: number; transform: string }> = [];
      Object.assign(window, { __coldStartSealSamples: samples });
      const sealNode = document.querySelector<HTMLElement>(".cs-seal-inst");
      const fillNode = document.querySelector<HTMLElement>(".cs-seal-inst-fill");
      if (!sealNode || !fillNode) {
        return;
      }
      const observer = new MutationObserver(() => {
        if (sealNode.dataset.level !== "2") {
          return;
        }
        observer.disconnect();
        let frames = 0;
        const sample = () => {
          const style = getComputedStyle(fillNode);
          samples.push({ opacity: Number(style.opacity), transform: style.transform });
          frames += 1;
          if (frames < 24) {
            requestAnimationFrame(sample);
          }
        };
        sample();
      });
      observer.observe(sealNode, { attributes: true, attributeFilter: ["data-level"] });
    });
    advanceSeal();

    await expect(seal).toHaveAttribute("data-level", "2");
    await page.waitForTimeout(380);
    const samples = await page.evaluate(() => (
      window as typeof window & {
        __coldStartSealSamples?: Array<{ opacity: number; transform: string }>;
      }
    ).__coldStartSealSamples ?? []);
    const transitionProperty = await fill.evaluate((node) => getComputedStyle(node).transitionProperty);
    const after = await fill.evaluate((node) => {
      const style = getComputedStyle(node);
      return { opacity: Number(style.opacity), transform: style.transform };
    });

    expect(before.opacity).toBe(0);
    expect(after.opacity).toBeCloseTo(0.52, 2);
    expect(samples.length).toBeGreaterThan(2);
    if (reducedMotion) {
      expect(transitionProperty).toBe("opacity");
      expect(samples.every((sample) => sample.transform === after.transform)).toBe(true);
      expect(samples.some((sample) => sample.opacity < after.opacity)).toBe(true);
    } else {
      expect(transitionProperty).toContain("transform");
      expect(samples.some((sample) => sample.opacity < after.opacity)).toBe(true);
      expect(samples.some((sample) => sample.transform !== after.transform)).toBe(true);
    }
  });
}

test("a contract mismatch becomes a retryable card error", async ({ page }) => {
  const card = readyCard();
  await installChromeShim(page, { activeDomain: card.domain });
  await page.route("**/api/extension/bootstrap?**", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": COLD_START_API_CONTRACT_HEADER,
        [COLD_START_API_CONTRACT_HEADER]: `${COLD_START_API_CONTRACT_VERSION}-stale`
      },
      body: JSON.stringify({
        domain: card.domain,
        slug: card.slug,
        card,
        runs: {
          basics: { slug: card.slug, domain: card.domain, mode: "basics", status: "complete" },
          analysis: { slug: card.slug, domain: card.domain, mode: "analysis", status: "idle" }
        }
      })
    });
  });
  await openSidePanel(page);

  await expect(page.getByRole("heading", { name: "Card unavailable" })).toBeVisible();
  await expect(page.getByText("The API deployment is out of date for this extension. Deploy the web app, then reload the unpacked extension.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeEnabled();
});

test("a watchdog-retired silent run recovers to retry and can file a cached result", async ({ page }) => {
  const card = readyCard();
  let retried = false;
  let failedStatusReads = 0;
  await installChromeShim(page, { activeDomain: card.domain });
  await page.route("**/api/extension/bootstrap?**", async (route) => {
    await fulfillJson(route, {
      domain: card.domain,
      slug: card.slug,
      card,
      events: [],
      runs: {
        basics: { slug: card.slug, domain: card.domain, mode: "basics", status: "complete" },
        analysis: {
          slug: card.slug,
          domain: card.domain,
          mode: "analysis",
          status: "running",
          startedAt: new Date(Date.now() - 6 * 60_000).toISOString(),
          events: []
        }
      }
    });
  });
  await page.route("**/api/extension/cards/**", async (route) => {
    await fulfillJson(route, retried ? readFullCard() : card);
  });
  await page.route("**/api/generate**", async (route) => {
    if (route.request().method() === "POST") {
      retried = true;
      await fulfillJson(route, { slug: card.slug, domain: card.domain, mode: "analysis", status: "cached" });
      return;
    }
    failedStatusReads += 1;
    await fulfillJson(route, {
      slug: card.slug,
      domain: card.domain,
      mode: "analysis",
      status: "failed",
      error: "Silent inline run retired by watchdog."
    });
  });
  await openSidePanel(page);

  await expect.poll(() => failedStatusReads).toBeGreaterThan(0);
  await expect(page.getByLabel("Lens run failed")).toBeVisible();
  const retry = page.getByRole("button", { name: "Run Investor Lens" });
  await expect(retry).toBeEnabled();
  await retry.click();
  await expect(page.getByRole("article", { name: "Investor read" })).toBeVisible();
  expect(retried).toBe(true);
});
