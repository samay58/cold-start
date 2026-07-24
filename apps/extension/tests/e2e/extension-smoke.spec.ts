import { chromium, expect, test } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  QA_API_ORIGIN,
  QA_TOKEN,
  browserbaseCardWithSynthesis,
  fulfillJson
} from "./fixtures";

const extensionDist = path.resolve(process.cwd(), "dist");

test("built MV3 extension boots and renders a cached card", async () => {
  test.skip(!existsSync(path.join(extensionDist, "manifest.json")), "Run npm run build before extension smoke.");

  const cachedCard = browserbaseCardWithSynthesis();
  const userDataDir = path.join(os.tmpdir(), `cold-start-extension-smoke-${Date.now()}`);
  mkdirSync(userDataDir, { recursive: true });

  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: "chromium",
    headless: false,
    viewport: { width: 420, height: 900 },
    args: [
      `--disable-extensions-except=${extensionDist}`,
      `--load-extension=${extensionDist}`
    ]
  });

  try {
    await context.route("**/api/extension/bootstrap?**", async (route) => {
      await fulfillJson(route, {
        domain: "browserbase.com",
        slug: "browserbase",
        card: cachedCard,
        runs: {
          basics: { slug: "browserbase", domain: "browserbase.com", mode: "basics", status: "idle" },
          analysis: { slug: "browserbase", domain: "browserbase.com", mode: "analysis", status: "idle" }
        }
      });
    });
    await context.route("**/api/extension/cards/**", async (route) => {
      await fulfillJson(route, cachedCard);
    });
    await context.route("**/api/generate?**", async (route) => {
      await fulfillJson(route, {
        slug: "browserbase",
        domain: "browserbase.com",
        status: "idle",
        mode: "analysis"
      });
    });

    const serviceWorker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    const extensionId = new URL(serviceWorker.url()).hostname;
    await serviceWorker.evaluate(
      ({ apiOrigin, apiToken }) => new Promise<void>((resolve) => {
        chrome.storage.local.set({ coldStartApiOrigin: apiOrigin, coldStartApiToken: apiToken }, () => {
          chrome.storage.session.set({ activeDomain: "browserbase.com" }, () => resolve());
        });
      }),
      { apiOrigin: QA_API_ORIGIN, apiToken: QA_TOKEN }
    );

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await expect(page.getByRole("heading", { name: "Browserbase" })).toBeVisible();
    await expect(page.getByLabel("Research layer")).toBeVisible();
    await expect(page.getByLabel("Research card stack")).toBeVisible();
    await expect(page.getByLabel("Company context").getByRole("link", { name: "browserbase.com" })).toBeVisible();
  } finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});
