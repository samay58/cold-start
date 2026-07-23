import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { installLensGalleryPhase, LENS_GALLERY_PHASE_IDS, type LensGalleryPhaseId } from "./lens-gallery-fixtures";
import { LENS_TENSION_EMPTY_COPY, LENS_TENSION_LABEL } from "../../src/research/investor-read-copy";

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
}

type PhaseCheck = {
  heading: string;
  verify: (page: Page) => Promise<void>;
};

async function investorRead(page: Page): Promise<Locator> {
  const read = page.getByRole("article", { name: "Investor read" });
  await expect(read).toBeVisible();
  return read;
}

const PHASE_CHECKS: Record<LensGalleryPhaseId, PhaseCheck> = {
  "read-full": {
    heading: "Baseten",
    verify: async (page) => {
      const read = await investorRead(page);
      await expect(read).toContainText("inference layer");
    }
  },
  "read-sparse": {
    heading: "Harbor Compute",
    verify: async (page) => {
      const read = await investorRead(page);
      await expect(read).toContainText(LENS_TENSION_LABEL.holds);
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
      await expect(withheldCard).toContainText("Fewer than 8 cited sources survived.");
    }
  },
  "withheld-advisory": {
    heading: "Fathom Metrics",
    verify: async (page) => {
      const read = await investorRead(page);
      await expect(read).toContainText(LENS_TENSION_LABEL.holds);
      await expect(read).toContainText(LENS_TENSION_LABEL.breaks);
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
      // The fixture's full event stream (through card.saved/generation.complete) is served on
      // every poll tick by this phase's static route mock, so by the time the gallery screenshots
      // it the stage list has advanced all the way to File, with the Verify stage's stamp marks
      // visible from the fixture's 5-survivor verify.complete event.
      await expect(running.locator(".cs-wait-stage[data-status='done']")).toHaveCount(4);
      await expect(running.locator(".cs-wait-stage-copy strong", { hasText: "File" })).toBeVisible();
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
    verify: async (page) => {
      // Hover the rich person: identity, a 3-line-clamped read, provenance, email, and
      // channels all render inside the dossier, with the read still clamped (unpinned).
      const mara = page.locator(".cs-people-person", { hasText: "Mara Voss" });
      await mara.hover();
      const tooltip = page.locator("#cs-company-shared-tooltip");
      await expect(tooltip).toBeVisible();
      await expect(tooltip).toHaveAttribute("data-variant", "dossier");
      await expect(tooltip).toHaveAttribute("role", "tooltip");
      await expect(tooltip.locator(".cs-dossier-read")).toContainText("Voss spent six years");
      await expect(tooltip.locator(".cs-dossier-provenance")).toBeVisible();
      await expect(tooltip.locator(".cs-dossier-email-address")).toHaveText("mara.voss@wharfrobotics.com");
      await expect(tooltip.locator(".cs-dossier-channel")).toHaveCount(2);
      await page.screenshot({ fullPage: true, path: path.join(SCREENSHOT_DIR, "dossier-hover.png") });

      // Pin it: the ARIA role promotes to dialog, focus moves in, and the read unclamps.
      await mara.focus();
      await page.keyboard.press("Enter");
      await expect(tooltip).toHaveAttribute("data-pinned", "true");
      await expect(tooltip).toHaveAttribute("role", "dialog");
      await page.screenshot({ fullPage: true, path: path.join(SCREENSHOT_DIR, "dossier-pinned.png") });
      await page.keyboard.press("Escape");

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
  for (const phaseId of LENS_GALLERY_PHASE_IDS) {
    test(`renders the ${phaseId} phase`, async ({ page }) => {
      await installLensGalleryPhase(page, phaseId);
      await openGalleryPhase(page, phaseId);

      const check = PHASE_CHECKS[phaseId];
      await expect(page.getByRole("heading", { name: check.heading })).toBeVisible();
      await check.verify(page);

      await page.waitForTimeout(300);
      await page.screenshot({ fullPage: true, path: path.join(SCREENSHOT_DIR, `${phaseId}.png`) });
    });
  }
});
