import { expect, test, type Page } from "@playwright/test";
import {
  browserbaseCardWithSynthesis,
  fulfillJson,
  granolaCard,
  installChromeShim,
  mockExtensionApi
} from "./fixtures";

/*
 * Dark-theme screenshot loop. These render every panel state under
 * data-theme="dark" so the Kyoto-paper-dark palette can be reviewed against the
 * spec's per-state ship bar. They assert structure stays intact in dark and
 * write full-page captures to /private/tmp/cold-start-dark-*.png for the eye.
 *
 * Until the Phase 2 controller lands, dark is forced two ways that both survive
 * later phases: the localStorage mirror the boot script will read, and a direct
 * attribute set after load. OS dark is also emulated so the Phase 3 matchMedia
 * path drives the same result once wired.
 */
async function seedDark(page: Page) {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(() => {
    try {
      localStorage.setItem("coldStartThemeEffective", "dark");
      localStorage.setItem("coldStartThemePreference", "dark");
    } catch {
      /* storage may be unavailable in some contexts */
    }
  });
}

async function applyDark(page: Page) {
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "dark";
    document.documentElement.dataset.themeReason = "manual";
  });
}

async function openDark(page: Page) {
  await page.goto("/sidepanel.html");
  await expect(page.locator("#root > *")).toHaveCount(1);
  await applyDark(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
}

test("dark: research layer with synthesis", async ({ page }) => {
  await seedDark(page);
  await installChromeShim(page);
  await mockExtensionApi(page, browserbaseCardWithSynthesis());
  await openDark(page);

  await expect(page.getByRole("heading", { name: "Browserbase" })).toBeVisible();
  await expect(page.getByLabel("Research layer")).toBeVisible();
  await page.waitForTimeout(250);
  await page.screenshot({ fullPage: true, path: "/private/tmp/cold-start-dark-research.png" });
});

test("dark: start gate for an ungenerated company", async ({ page }) => {
  await seedDark(page);
  await installChromeShim(page, { activeDomain: "legora.com" });
  await mockExtensionApi(page, null);
  await openDark(page);

  await expect(page.getByRole("heading", { name: "Legora" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Get up to speed" })).toBeVisible();
  await page.waitForTimeout(150);
  await page.screenshot({ fullPage: true, path: "/private/tmp/cold-start-dark-start.png" });
});

test("dark: signals ledger with corroborated events", async ({ page }) => {
  await seedDark(page);
  await installChromeShim(page, { activeDomain: "granola.ai" });
  await mockExtensionApi(page, granolaCard());
  await openDark(page);

  await expect(page.getByRole("heading", { name: "Granola" })).toBeVisible();
  const dormantSignals = page.locator(".cs-dormant-card", { hasText: "Signals" });
  await dormantSignals.scrollIntoViewIfNeeded();
  await dormantSignals.focus();
  await page.keyboard.press("Enter");
  const active = page.locator('.cs-active-enrichment[data-layer-id="signals"]');
  await expect(active).toBeVisible();
  await page.waitForTimeout(450);
  await page.screenshot({ fullPage: true, path: "/private/tmp/cold-start-dark-signals.png" });
});

test("dark: settings panel with appearance toggle", async ({ page }) => {
  await seedDark(page);
  await installChromeShim(page, { apiToken: "" });
  await mockExtensionApi(page, null);
  await openDark(page);

  const toggle = page.locator(".cs-theme-toggle");
  await expect(toggle).toBeVisible();
  await expect(toggle.getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");
  await page.screenshot({ fullPage: true, path: "/private/tmp/cold-start-dark-settings.png" });
});

test("dark: running generation progress", async ({ page }) => {
  await seedDark(page);
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
  await openDark(page);

  await expect(page.getByText("Researching")).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ fullPage: true, path: "/private/tmp/cold-start-dark-progress.png" });
});
