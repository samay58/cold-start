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
        alpha: {
          generationEnabled: true,
          profile: { limit: 12, reserved: 0, used: 2, remaining: 10 },
          lens: { limit: 6, reserved: 0, used: 1, remaining: 5 }
        },
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
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await expect(page.getByRole("heading", { name: "Open your invitation" })).toBeVisible();
    await expect(page.getByText("No setup code is needed here.")).toBeVisible();
    await expect(page.getByText("Extension token")).toHaveCount(0);
    await expect(page.locator("input[type='password']")).toHaveCount(0);
    await page.screenshot({
      fullPage: true,
      path: "/private/tmp/cold-start-alpha-unconnected-light.png"
    });
    await page.evaluate(() => {
      document.documentElement.dataset.theme = "dark";
      document.documentElement.dataset.themeReason = "manual";
    });
    await page.screenshot({
      fullPage: true,
      path: "/private/tmp/cold-start-alpha-unconnected-dark.png"
    });

    await serviceWorker.evaluate(
      ({ apiOrigin, apiToken }) => new Promise<void>((resolve) => {
        chrome.storage.local.set({ coldStartApiOrigin: apiOrigin, coldStartApiToken: apiToken }, () => {
          chrome.storage.session.set({ activeDomain: "browserbase.com" }, () => resolve());
        });
      }),
      { apiOrigin: QA_API_ORIGIN, apiToken: QA_TOKEN }
    );

    await page.reload();
    await expect(page.getByRole("heading", { name: "Browserbase" })).toBeVisible();
    await expect(page.getByText("10 profiles · 5 Lens runs left")).toBeVisible();
    await expect(page.getByLabel("Research layer")).toBeVisible();
    await expect(page.getByLabel("Research card stack")).toBeVisible();
    await expect(page.getByLabel("Company context").getByRole("link", { name: "browserbase.com" })).toBeVisible();

    await page.getByRole("button", { name: "Open settings" }).click();
    await expect(page.getByRole("heading", { name: "Cold Start" })).toBeVisible();
    await expect(page.getByLabel("Alpha allowance")).toContainText("10");
    await expect(page.getByLabel("Alpha allowance")).toContainText("5");
    await expect(page.getByText("Public cards never identify who requested them.")).toBeVisible();
    await expect(page.getByText("Extension token")).toHaveCount(0);
    await expect(page.getByText("Origin", { exact: true })).toHaveCount(0);
    await page.screenshot({
      fullPage: true,
      path: "/private/tmp/cold-start-alpha-settings-light.png"
    });
    await page.getByRole("radio", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.getByText("Diagnostics", { exact: true }).click();
    await expect(page.getByText("Contract", { exact: true })).toBeVisible();
    await expect(page.getByText("Last error", { exact: true })).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: "/private/tmp/cold-start-alpha-settings-dark.png"
    });
  } finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});
