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

type HowItWinsJob = {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled" | "superseded";
  stage: "queued" | "judge_initial" | "judge_recovery" | "critic" | "adjudication" | "writer" | "verifier" | "storage" | "complete";
  reasonCode: string | null;
  canRetry: boolean;
  updatedAt: string;
  outcome?: "read" | "thin_file" | "nothing_stands_out";
};

async function installHowItWinsRecovery(
  page: Page,
  input: {
    card?: ColdStartCard;
    status: (domain: string, read: number) => HowItWinsJob | null | Promise<HowItWinsJob | null>;
    retry?: (route: Route, body: { jobId: string; requestId: string }) => Promise<void>;
    onGeneratePost?: () => void;
  }
) {
  const card = input.card ?? readFullCard();
  const statusReads = new Map<string, number>();
  await installChromeShim(page, { activeDomain: card.domain });
  await page.route("**/api/extension/bootstrap?**", async (route) => {
    const domain = new URL(route.request().url()).searchParams.get("domain") ?? card.domain;
    const slug = domain.split(".")[0] ?? card.slug;
    const currentCard = domain === card.domain
      ? card
      : {
          ...card,
          slug,
          domain,
          identity: {
            ...card.identity,
            name: { ...card.identity.name, value: slug === "exa" ? "Exa" : slug }
          }
        };
    await fulfillJson(route, {
      domain,
      slug,
      card: currentCard,
      runs: {
        basics: { slug, domain, mode: "basics", status: "complete" },
        analysis: { slug, domain, mode: "analysis", status: "complete" }
      }
    });
  });
  await page.route("**/api/extension/cards/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const parts = url.pathname.split("/").filter(Boolean);
    const howItWins = parts.at(-1) === "how-it-wins";
    const slug = howItWins ? parts.at(-2) ?? card.slug : parts.at(-1) ?? card.slug;
    const domain = slug === card.slug ? card.domain : `${slug}.ai`;
    if (howItWins) {
      if (request.method() === "POST" && input.retry) {
        await input.retry(route, request.postDataJSON() as { jobId: string; requestId: string });
        return;
      }
      const read = (statusReads.get(domain) ?? 0) + 1;
      statusReads.set(domain, read);
      await fulfillJson(route, { job: await input.status(domain, read) });
      return;
    }
    const currentCard = domain === card.domain
      ? card
      : {
          ...card,
          slug,
          domain,
          identity: {
            ...card.identity,
            name: { ...card.identity.name, value: slug === "exa" ? "Exa" : slug }
          }
        };
    await fulfillJson(route, currentCard);
  });
  await page.route("**/api/generate**", async (route) => {
    if (route.request().method() === "POST") input.onGeneratePost?.();
    const url = new URL(route.request().url());
    const domain = url.searchParams.get("domain") ?? card.domain;
    await fulfillJson(route, {
      slug: domain.split(".")[0] ?? card.slug,
      domain,
      mode: url.searchParams.get("mode") ?? "analysis",
      status: "complete"
    });
  });
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
  let statusReads = 0;
  const runId = "analysis-live";
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
        status: input.postStatus ?? "cached",
        ...((input.postStatus ?? "cached") === "queued" ? { runId } : {})
      });
      return;
    }
    statusReads += 1;
    const running = input.postStatus === "queued" && started && statusReads === 1;
    await fulfillJson(route, {
      slug: initialCard.slug,
      domain: initialCard.domain,
      mode: "analysis",
      status: started ? (running ? "running" : "complete") : "idle",
      ...(started && input.postStatus === "queued"
        ? {
            runId,
            events: [{
              id: running ? "analysis-started" : "analysis-complete",
              runId,
              slug: initialCard.slug,
              domain: initialCard.domain,
              sectionId: null,
              type: running ? "synthesis.started" : "generation.complete",
              message: running ? "Reading the filed evidence" : "Research run complete",
              metadata: {},
              createdAt: new Date().toISOString()
            }]
          }
        : {})
    });
  });
}

async function installEntranceSampler(page: Page) {
  await page.evaluate(() => {
    const samples: Array<{ opacity: number; transform: string }> = [];
    Object.assign(window, { __coldStartLensEntranceSamples: samples });
    let sampling = false;
    const observer = new MutationObserver(() => {
      const category = document.querySelector<HTMLElement>('.cs-investor-read-category[data-category="why-care"]');
      if (!category || sampling) {
        return;
      }
      sampling = true;
      let frames = 0;
      const sample = () => {
        const style = getComputedStyle(category);
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
  await expect(page.getByRole("article", { name: "Investor Lens" })).toBeVisible();
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

  const firstCategory = page.locator('.cs-investor-read-category[data-category="why-care"]');
  await expect(firstCategory).toBeVisible();
  const resting = await firstCategory.evaluate((node) => {
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
    await installReadyAnalysis(page, { cardAfterPost: readFullCard(), postStatus: "queued" });
    await openSidePanel(page);
    await installEntranceSampler(page);

    await page.getByRole("button", { name: "Run Investor Lens" }).click();
    await expect(page.getByRole("article", { name: "Investor Lens" })).toBeVisible();
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

test("a failed How it wins job remains visible after a panel reload", async ({ page }) => {
  let generatePosts = 0;
  await installHowItWinsRecovery(page, {
    status: () => ({
      id: "11111111-1111-4111-8111-111111111111",
      status: "failed",
      stage: "writer",
      reasonCode: "structured_output",
      canRetry: true,
      updatedAt: "2026-09-14T18:00:00.000Z"
    }),
    onGeneratePost: () => {
      generatePosts += 1;
    }
  });
  await openSidePanel(page);

  await expect(page.getByText("The update couldn't finish.")).toBeVisible();
  await expect(page.getByText("The returned read was incomplete.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(page.locator(".cs-how-it-wins-sentence")).toContainText("It wins on cost per token");

  await page.reload();
  await expect(page.getByText("The update couldn't finish.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(page.locator(".cs-how-it-wins-sentence")).toContainText("It wins on cost per token");
  expect(generatePosts).toBe(0);
});

test("retry is one pending request and stays usable in a narrow reduced-motion panel", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 320, height: 640 });
  let retryPosts = 0;
  let releaseRetry: (() => void) | undefined;
  let retried = false;
  const retryReleased = new Promise<void>((resolve) => {
    releaseRetry = resolve;
  });
  await installHowItWinsRecovery(page, {
    status: () => retried
      ? {
          id: "22222222-2222-4222-8222-222222222222",
          status: "queued",
          stage: "queued",
          reasonCode: null,
          canRetry: false,
          updatedAt: "2026-09-14T18:01:00.000Z"
        }
      : {
          id: "11111111-1111-4111-8111-111111111111",
          status: "failed",
          stage: "writer",
          reasonCode: "structured_output",
          canRetry: true,
          updatedAt: "2026-09-14T18:00:00.000Z"
        },
    retry: async (route, body) => {
      retryPosts += 1;
      expect(body.jobId).toBe("11111111-1111-4111-8111-111111111111");
      expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
      await retryReleased;
      retried = true;
      await fulfillJson(route, {
        job: {
          id: "22222222-2222-4222-8222-222222222222",
          status: "queued",
          stage: "queued",
          reasonCode: null,
          canRetry: false,
          updatedAt: "2026-09-14T18:01:00.000Z"
        }
      }, 202);
    }
  });
  await openSidePanel(page);

  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find((candidate) => candidate.textContent === "Try again");
    button?.click();
    button?.click();
  });
  await expect(page.getByRole("button", { name: "Starting" })).toBeDisabled();
  await expect.poll(() => retryPosts).toBe(1);
  const statusBox = page.locator(".cs-how-it-wins-status");
  await statusBox.scrollIntoViewIfNeeded();
  await expect(statusBox).toBeInViewport();
  expect(await statusBox.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);

  releaseRetry?.();
  await expect(page.getByText("Reading how it wins")).toBeVisible();
  expect(retryPosts).toBe(1);
});

test("a late How it wins response cannot replace the company reached by navigation", async ({ page }) => {
  let releaseBrowserbase: (() => void) | undefined;
  const browserbaseReleased = new Promise<void>((resolve) => {
    releaseBrowserbase = resolve;
  });
  await installHowItWinsRecovery(page, {
    status: async (domain) => {
      if (domain === "browserbase.com") {
        await browserbaseReleased;
        return {
          id: "11111111-1111-4111-8111-111111111111",
          status: "failed",
          stage: "writer",
          reasonCode: "structured_output",
          canRetry: true,
          updatedAt: "2026-09-14T18:00:00.000Z"
        };
      }
      return {
        id: "22222222-2222-4222-8222-222222222222",
        status: "failed",
        stage: "verifier",
        reasonCode: "semantic_contract",
        canRetry: false,
        updatedAt: "2026-09-14T18:02:00.000Z"
      };
    }
  });
  await openSidePanel(page);

  await page.evaluate(() => {
    (window as typeof window & { __coldStartSetActiveDomain: (domain: string) => void })
      .__coldStartSetActiveDomain("exa.ai");
  });
  await expect(page.getByRole("heading", { name: "Exa" })).toBeVisible();
  await expect(page.getByText("The update couldn't finish.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0);

  releaseBrowserbase?.();
  await page.waitForTimeout(100);
  await expect(page.getByRole("heading", { name: "Exa" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0);
});

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
  // The QA side panel runs against a local API origin, so it keeps the developer instruction.
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
  await expect(page.getByLabel("Investor Lens run failed")).toBeVisible();
  const retry = page.getByRole("button", { name: "Run Investor Lens" });
  await expect(retry).toBeEnabled();
  await retry.click();
  await expect(page.getByRole("article", { name: "Investor Lens" })).toBeVisible();
  expect(retried).toBe(true);
});
