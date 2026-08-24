import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { installLensGalleryPhase, LENS_GALLERY_PHASE_IDS, type LensGalleryPhaseId } from "./lens-gallery-fixtures";
import { LENS_CASE_LABEL, LENS_TENSION_EMPTY_COPY } from "../../src/research/investor-read-copy";

// One run of this spec writes every phase's screenshot under the same timestamped directory,
// so a single `npm run qa:extension:gallery` produces one comparable set. This is the fixture
// gallery the rest of the investor-lens-overhaul Phase 2 work iterates and screenshots against.
const RUN_TIMESTAMP = new Date().toISOString().replace(/[:.]/g, "-");
const SCREENSHOT_DIR = path.join(os.homedir(), "Downloads", "cold-start-qa", RUN_TIMESTAMP, "lens");

test.beforeAll(() => {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
});

async function openGalleryPhase(page: Page, phaseId: LensGalleryPhaseId) {
  // The query param is a fixture-selector for traceability in the Playwright trace/report only;
  // the actual phase state comes from installLensGalleryPhase's route mocks and chrome-storage
  // seed, installed before this navigation, following the same convention as every other
  // sidepanel-ui.spec.ts test in this harness.
  await page.goto(`/sidepanel.html?fixture=${phaseId}`);
  await expect(page.locator("#root > *")).toHaveCount(1);
  await expect(page.locator('.cs-panel-stage-scene[data-panel="loading"]')).toHaveCount(0);
}

type PhaseCheck = {
  heading: string;
  verify: (page: Page, screenshotDir: string) => Promise<void>;
};

async function investorRead(page: Page): Promise<Locator> {
  const read = page.getByRole("article", { name: "Investor read" });
  await expect(read).toBeVisible();
  return read;
}

async function expectNoAccentRibbon(surface: Locator) {
  await expect(surface).toHaveCSS("background-image", "none");
  const { accent, shadow } = await surface.evaluate((element) => {
    const swatch = document.createElement("span");
    swatch.style.color = "var(--cs-accent-seal)";
    document.body.append(swatch);
    const accent = getComputedStyle(swatch).color;
    swatch.remove();
    return { accent, shadow: getComputedStyle(element).boxShadow };
  });
  expect(shadow).not.toContain(accent);
}

// Where the crown's cut marks are right now, in viewport coordinates, read off the drawn svg
// rather than recomputed here: the geometry module owns where they land. Re-read before every
// pointer action, since an element screenshot scrolls the panel and moves them.
async function crownGeometry(crown: Locator): Promise<{ centres: number[]; y: number }> {
  const box = await crown.locator(".cs-how-it-wins-edge svg").boundingBox();
  const centres = await crown.locator(".cs-hiw-cut-wall").evaluateAll((nodes) =>
    nodes.map((node) => {
      const mark = node.getBoundingClientRect();
      return mark.x + mark.width / 2;
    })
  );
  return { centres, y: (box?.y ?? 0) + 6 };
}

// The four crown states worth a picture: at rest, scrubbing an unmarked tick, one running mark
// pinned, and the bracket pinned. Each shot is the whole plate, so a note that ever covered the
// sentence or changed the plate's height would show up in the file.
async function captureCrown(page: Page, read: Locator, screenshotDir: string) {
  const crown = read.locator(".cs-how-it-wins");
  await expect(crown).toBeVisible();
  await expect(crown).toHaveAttribute("data-state", "read");
  // 300ms before the marks start dropping, 520ms to land.
  await page.waitForTimeout(900);
  await read.screenshot({ path: path.join(screenshotDir, "how-it-wins-rest.png") });

  // Between the first two marks: the scale of 80 is up, one tick has ink, no note opens.
  const scrub = await crownGeometry(crown);
  expect(scrub.centres.length).toBe(3);
  const between = ((scrub.centres[0] ?? 0) + (scrub.centres[1] ?? 0)) / 2;
  await page.mouse.move(between, scrub.y);
  await expect(crown.locator('.cs-hiw-tick[data-hot="true"]')).toHaveCount(1);
  await expect(crown.locator('.cs-how-it-wins-note[data-open="true"]')).toHaveCount(0);
  await read.screenshot({ path: path.join(screenshotDir, "how-it-wins-hover-tick.png") });

  const targetButtons = crown.locator(".cs-how-it-wins-targets button");
  const markButton = targetButtons.filter({ hasNotText: /\+/ }).first();
  await markButton.focus();
  await markButton.press("Enter");
  await expect(crown).toHaveAttribute("data-pinned", "true");
  await expect(crown.locator('.cs-how-it-wins-note[data-open="true"]')).toHaveCount(1);
  await expect(crown.locator(".cs-how-it-wins-kicker small")).toHaveText("pinned");
  await read.screenshot({ path: path.join(screenshotDir, "how-it-wins-pinned-mark.png") });

  await markButton.press("Escape");
  await expect(crown).toHaveAttribute("data-pinned", "false");

  const pairButton = targetButtons.filter({ hasText: /\+/ }).first();
  await pairButton.focus();
  await pairButton.press("Enter");
  await expect(crown).toHaveAttribute("data-pinned", "true");
  await expect(crown.locator(".cs-how-it-wins-note")).toHaveAttribute("aria-label", /and/);
  await read.screenshot({ path: path.join(screenshotDir, "how-it-wins-pinned-pair.png") });

  await pairButton.press("Escape");
  await expect(crown).toHaveAttribute("data-pinned", "false");
  await page.mouse.move(5, 5);
}

const PHASE_CHECKS: Record<LensGalleryPhaseId, PhaseCheck> = {
  blocked: {
    heading: "Loom Signal",
    verify: async (page) => {
      const control = page.getByRole("button", { name: "Run Investor Lens" });
      await expect(control).toBeDisabled();
      await expect(control).toContainText("profile needs source-backed evidence before analysis");
      await expect(control).toContainText("Unavailable");
    }
  },
  ready: {
    heading: "Loom Signal",
    verify: async (page, screenshotDir) => {
      const control = page.getByRole("button", { name: "Run Investor Lens" });
      await expect(control).toBeEnabled();
      await expect(control).toContainText("See why it matters, the case, how it wins, and what to learn next.");
      await expect(control).toContainText("Build read");
      await expectNoAccentRibbon(control);
      const researchLayer = page.getByRole("region", { name: "Research layer" });
      await expect(researchLayer).toHaveCSS("border-top-width", "0px");
      await expect(researchLayer).toHaveCSS("box-shadow", "none");

      const mark = control.locator(".cs-investor-lens-control-mark");
      const action = control.locator(".cs-investor-lens-control-action");
      const restingMarkColor = await mark.evaluate((element) => getComputedStyle(element).color);
      const sealColor = await control.evaluate(() => {
        const swatch = document.createElement("span");
        swatch.style.color = "var(--color-seal)";
        document.body.append(swatch);
        const color = getComputedStyle(swatch).color;
        swatch.remove();
        return color;
      });
      await control.hover();
      await expect(mark).toHaveCSS("color", sealColor);
      await expect(action).toHaveCSS("color", sealColor);
      await page.screenshot({ fullPage: true, path: path.join(screenshotDir, "ready-hover.png") });
      await page.mouse.move(5, 5);
      await expect.poll(() => mark.evaluate((element) => getComputedStyle(element).color))
        .toBe(restingMarkColor);
    }
  },
  "read-full": {
    heading: "Baseten",
    verify: async (page, screenshotDir) => {
      const read = await investorRead(page);
      await expectNoAccentRibbon(read);
      const categories = read.locator(".cs-investor-read-category");
      await expect(categories).toHaveCount(4);
      // The plate's own height, logged so the fold and the crown that follows it can be
      // compared against the same fixture at the same panel width.
      const plateHeight = (await read.boundingBox())?.height;
      console.log(`[lens-gallery] read-full .cs-investor-read height: ${plateHeight}px`);
      await captureCrown(page, read, screenshotDir);

      await expect(categories.nth(0)).toHaveAttribute("data-category", "why-care");
      await expect(categories.nth(0).locator(".cs-investor-read-category-trigger")).toHaveAttribute("aria-expanded", "true");
      await expect(read.locator(".cs-investor-read-lede")).toContainText("inference layer");

      const whyCareTrigger = categories.nth(0).locator(".cs-investor-read-category-trigger");
      const restingBackground = await whyCareTrigger.evaluate((element) => getComputedStyle(element).backgroundColor);
      await whyCareTrigger.hover();
      await expect.poll(() => whyCareTrigger.evaluate((element) => getComputedStyle(element).backgroundColor))
        .toBe(restingBackground);
      await page.screenshot({ fullPage: true, path: path.join(screenshotDir, "read-full-hover.png") });

      for (const categoryId of ["the-case", "pay-attention", "learn-next"] as const) {
        const category = read.locator(`[data-category="${categoryId}"]`);
        const trigger = category.locator(".cs-investor-read-category-trigger");
        await trigger.click();
        await expect(trigger).toHaveAttribute("aria-expanded", "true");
        await expect(read.locator('.cs-investor-read-category[data-open="true"]')).toHaveCount(1);
        await page.waitForTimeout(220);
        await page.screenshot({ fullPage: true, path: path.join(screenshotDir, `read-full-${categoryId}.png`) });
      }

      const learnNextDisclosure = read.locator('[data-category="learn-next"] .cs-investor-read-more');
      if (await learnNextDisclosure.isVisible()) {
        await learnNextDisclosure.click();
        await expect(learnNextDisclosure).toHaveAttribute("aria-expanded", "true");
        await expect(read.locator('[data-category="learn-next"] .cs-lens-question-item')).toHaveCount(3);
        await page.waitForTimeout(220);
        await page.screenshot({ fullPage: true, path: path.join(screenshotDir, "read-full-learn-next-expanded.png") });
      }

      const learnNext = read.locator('[data-category="learn-next"]');
      await learnNext.locator(".cs-investor-read-category-trigger").click();
      await expect(read.locator('.cs-investor-read-category[data-open="true"]')).toHaveCount(0);
      await page.waitForTimeout(350);
      await page.screenshot({ fullPage: true, path: path.join(screenshotDir, "read-full-collapsed.png") });

      await read.locator('[data-category="why-care"] .cs-investor-read-category-trigger').click();
      await expect(read.locator('[data-category="why-care"]')).toHaveAttribute("data-open", "true");
    }
  },
  "read-sparse": {
    heading: "Harbor Compute",
    verify: async (page) => {
      const read = await investorRead(page);
      await expect(read.locator(".cs-investor-read-category")).toHaveCount(4);
      await expect(read).toContainText(LENS_CASE_LABEL.holds);
      // The 0-bear side gets its own honest, specific empty state, not the generic
      // "None survived verification." every empty row used to share.
      await expect(read).toContainText(LENS_TENSION_EMPTY_COPY.breaks);
    }
  },
  withheld: {
    heading: "Nettle Systems",
    verify: async (page) => {
      const withheldCard = page.getByLabel("Lens withheld");
      await expect(withheldCard).toBeVisible();
      await expect(withheldCard).toContainText("There is not enough public evidence for a useful read yet.");
    }
  },
  "withheld-advisory": {
    heading: "Fathom Metrics",
    verify: async (page) => {
      const read = await investorRead(page);
      await expect(read).toContainText(LENS_CASE_LABEL.holds);
      await expect(read).toContainText(LENS_CASE_LABEL.breaks);
      // This card has synthesis and no synthesisWithheld record, so the posture line reads
      // synthesisEvidenceSignals live: every non-enrichment citation is sourceType "news".
      const posture = page.getByLabel("Evidence posture");
      await expect(posture).toBeVisible();
      await expect(posture).toContainText("Only news coverage is cited so far.");
    }
  },
  "running-events": {
    heading: "DeepInfra",
    verify: async (page) => {
      const running = page.getByLabel("Investor Lens running");
      await expect(running).toBeVisible();
      // The running phase deliberately stops after verify.complete. File remains pending until
      // card.saved, while the five source-backed marks are already visible.
      await expect(running.locator(".cs-wait-stage[data-status='done']")).toHaveCount(3);
      await expect(running.locator(".cs-wait-stage[data-status='current'] .cs-wait-stage-copy strong")).toHaveText("Check");
      await expect(running.locator(".cs-wait-stage[data-status='pending'] .cs-wait-stage-copy strong")).toHaveText("File");
      await expect(running.locator(".cs-wait-stamp")).toHaveCount(5);
    }
  },
  failed: {
    heading: "Loom Signal",
    verify: async (page) => {
      const failedNotice = page.getByLabel("Lens run failed");
      await expect(failedNotice).toBeVisible();
      await expect(failedNotice).toContainText("Investor Lens run failed.");
    }
  },
  dossier: {
    heading: "Wharf Robotics",
    verify: async (page, screenshotDir) => {
      await expect(page.locator("#cs-company-shared-tooltip")).toHaveCount(0);
      await page.screenshot({ fullPage: true, path: path.join(screenshotDir, "dossier-closed.png") });

      // Hover the rich person: identity, a 3-line-clamped read, provenance, email, and
      // channels all render inside the dossier, with the read still clamped (unpinned).
      const mara = page.locator(".cs-people-person", { hasText: "Mara Voss" });
      await expect(mara.locator(".cs-person-dossier-cue")).toHaveText("View");
      await mara.hover();
      const tooltip = page.locator("#cs-company-shared-tooltip");
      await expect(tooltip).toBeVisible();
      await expect(tooltip).toHaveAttribute("data-variant", "dossier");
      await expect(tooltip).toHaveAttribute("role", "dialog");
      await expect(tooltip.locator(".cs-dossier-read")).toContainText("Voss spent six years");
      await expect(tooltip.locator(".cs-dossier-provenance")).toBeVisible();
      await expect(tooltip.locator(".cs-dossier-email-address")).toHaveText("mara.voss@wharfrobotics.com");
      await expect(tooltip.locator(".cs-dossier-channel")).toHaveCount(2);
      const dismiss = tooltip.getByRole("button", { name: "Close Mara Voss dossier" });
      await expect(dismiss).toBeVisible();
      await page.screenshot({ fullPage: true, path: path.join(screenshotDir, "dossier-hover.png") });
      await dismiss.click();
      await expect(tooltip).toHaveCount(0);
      await expect(mara).toBeFocused();

      // Pin it: focus moves into the dialog and the read unclamps.
      await mara.focus();
      await page.keyboard.press("Enter");
      await expect(tooltip).toHaveAttribute("data-pinned", "true");
      await expect(tooltip).toHaveAttribute("role", "dialog");
      await page.keyboard.press("Tab");
      await expect(dismiss).toBeFocused();
      await page.screenshot({ fullPage: true, path: path.join(screenshotDir, "dossier-pinned.png") });
      await page.keyboard.press("Escape");
      await expect(tooltip).toHaveCount(0);
      await expect(mara).toBeFocused();

      // The inferred-email person: basis line only, since Idris has no read.
      const idris = page.locator(".cs-people-person", { hasText: "Idris Kanu" });
      await idris.hover();
      await expect(tooltip).toBeVisible();
      await expect(tooltip.locator(".cs-dossier-email-kind")).toHaveText("Inferred");
      await expect(tooltip.locator(".cs-dossier-email-basis")).toBeVisible();

      // The overflow chip reveals the 2 filler execs behind the measured-height frame.
      await page.mouse.move(5, 5);
      const overflow = page.getByRole("button", { name: /Show 2 more people/ });
      await expect(overflow).toBeVisible();
      await overflow.click();
      await expect(page.getByText("Owen Mercer")).toBeVisible();
    }
  }
};

test.describe("lens fixture gallery", () => {
  for (const theme of ["light", "dark"] as const) {
    for (const phaseId of LENS_GALLERY_PHASE_IDS) {
      test(`renders the ${phaseId} phase in ${theme}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: theme });
        await page.addInitScript((selectedTheme) => {
          localStorage.setItem("coldStartThemeEffective", selectedTheme);
          localStorage.setItem("coldStartThemePreference", selectedTheme);
        }, theme);
        await installLensGalleryPhase(page, phaseId);
        await openGalleryPhase(page, phaseId);
        await page.evaluate((selectedTheme) => {
          document.documentElement.dataset.theme = selectedTheme;
          document.documentElement.dataset.themeReason = "manual";
        }, theme);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

        const check = PHASE_CHECKS[phaseId];
        await expect(page.getByRole("heading", { name: check.heading })).toBeVisible();
        const screenshotDir = path.join(SCREENSHOT_DIR, theme);
        fs.mkdirSync(screenshotDir, { recursive: true });
        await check.verify(page, screenshotDir);

        await page.waitForTimeout(300);
        await page.screenshot({ fullPage: true, path: path.join(screenshotDir, `${phaseId}.png`) });
      });
    }
  }
});
