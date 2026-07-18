import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import {
  browserbaseCardWithPeople,
  browserbaseCardWithInferredEmail,
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

test("dark: people rows and fact cells keep visible edges", async ({ page }) => {
  await seedDark(page);
  await installChromeShim(page);
  await mockExtensionApi(page, browserbaseCardWithPeople());
  await openDark(page);

  await expect(page.getByRole("heading", { name: "Browserbase" })).toBeVisible();
  const people = page.locator(".cs-people-person");
  await expect(people.first()).toBeVisible();
  await people.first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await page.screenshot({ fullPage: true, path: "/private/tmp/cold-start-dark-people.png" });
});

test("dark: inferred email dossier keeps status, basis, and readable hierarchy", async ({ page }) => {
  await seedDark(page);
  await installChromeShim(page);
  await mockExtensionApi(page, browserbaseCardWithInferredEmail());
  await openDark(page);

  await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
  const person = page.locator(".cs-people-person", { hasText: "Paul Klein" });
  await person.focus();
  const tooltip = page.locator("#cs-company-shared-tooltip");
  await expect(tooltip).toBeVisible();
  await expect(tooltip.locator(".cs-dossier-email-kind")).toHaveText("Inferred");
  await expect(tooltip.locator(".cs-dossier-email-basis")).toHaveText(
    "domain pattern first.last, 3 observed addresses"
  );
  await page.screenshot({
    fullPage: true,
    path: fileURLToPath(new URL("../../../../docs/archive/specs/screenshots/inferred-email-coverage/after/dark-inferred-dossier.png", import.meta.url))
  });
});

test("dark: start gate for an ungenerated company", async ({ page }) => {
  await seedDark(page);
  await installChromeShim(page, { activeDomain: "legora.com" });
  await mockExtensionApi(page, null);
  await openDark(page);

  await expect(page.getByRole("heading", { name: "Legora" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Begin research" })).toBeVisible();
  // The status slot renders empty at intake; there is no "No profile" chip.
  await expect(page.getByText("No profile")).toHaveCount(0);
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

test("auto preference resolves OS dark to a system-driven dark theme", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await installChromeShim(page);
  await mockExtensionApi(page, browserbaseCardWithSynthesis());
  await page.goto("/sidepanel.html");
  await expect(page.locator("#root > *")).toHaveCount(1);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme-reason", "system");
});

test("flipping the OS scheme updates the theme live", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await installChromeShim(page);
  await mockExtensionApi(page, browserbaseCardWithSynthesis());
  await page.goto("/sidepanel.html");
  await expect(page.locator("#root > *")).toHaveCount(1);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme-reason", "system");
});

test("a manual preference overrides the OS scheme", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await installChromeShim(page, { apiToken: "" });
  await mockExtensionApi(page, null);
  await page.goto("/sidepanel.html");
  await expect(page.locator(".cs-theme-toggle")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.getByRole("radio", { name: "Light" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveAttribute("data-theme-reason", "manual");
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
  const startedAt = new Date(Date.now() - 30_000).toISOString();
  const events = [
    {
      id: "e1",
      runId: "r1",
      slug: "cartesia",
      domain: "cartesia.ai",
      sectionId: null,
      type: "source.found",
      message: "Found 2 accepted sources",
      metadata: {
        acceptedCount: 2,
        sources: [
          { url: "https://cartesia.ai/", domain: "cartesia.ai", title: "Cartesia", sourceType: "company_site", imageUrl: null },
          { url: "https://techcrunch.com/cartesia", domain: "techcrunch.com", title: "Cartesia raises a Series B", sourceType: "news", imageUrl: null }
        ]
      },
      createdAt: "2026-06-01T00:00:02.000Z"
    }
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
  await openDark(page);

  // The whisper plus seal instrument are the one status voice; clippings are the first content.
  await expect(page.locator(".cs-assembly-whisper")).toContainText("2 sources, building profile");
  await expect(page.locator(".cs-seal-inst")).toHaveAttribute("data-level", "2");
  await expect(page.locator(".cs-clipping")).toHaveCount(2);
  await page.waitForTimeout(400);
  await page.screenshot({ fullPage: true, path: "/private/tmp/cold-start-dark-progress.png" });
});
