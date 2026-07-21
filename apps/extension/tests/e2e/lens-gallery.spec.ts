import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { installLensGalleryPhase, LENS_GALLERY_PHASE_IDS, type LensGalleryPhaseId } from "./lens-gallery-fixtures";

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
      await expect(read).toContainText("If true");
      // The 0-bear side gets its own honest, specific empty state, not the generic
      // "None survived verification." every empty row used to share.
      await expect(read).toContainText("No breaking claim survived verification.");
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
      await expect(read).toContainText("If true");
      await expect(read).toContainText("It breaks if");
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
    }
  },
  failed: {
    heading: "Loom Signal",
    verify: async (page) => {
      const failedNotice = page.getByLabel("Lens run failed");
      await expect(failedNotice).toBeVisible();
      await expect(failedNotice).toContainText("Investor Lens run failed.");
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
