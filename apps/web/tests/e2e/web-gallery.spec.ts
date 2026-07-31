import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";

// One run of this spec writes every page's screenshot under the same timestamped directory, one
// subfolder per viewport project, so a single `npm run qa:web:gallery` produces one comparable
// set. This is the fixture gallery the rest of the landing/public-card redesign iterates and
// screenshots against; the current run captures the pre-redesign (old) card face as the
// baseline. Later tasks extend this spec with interaction states.
//
// The desktop and mobile projects each load this module in their own worker process, so the
// timestamp is anchored once in playwright.config.ts (loaded once by the CLI, inherited by every
// worker) rather than computed inline here, where it would differ per project.
const RUN_TIMESTAMP = process.env.COLD_START_GALLERY_RUN_TIMESTAMP ?? new Date().toISOString().replace(/[:.]/g, "-");
const SCREENSHOT_ROOT = path.join(os.homedir(), "Downloads", "cold-start-qa", RUN_TIMESTAMP, "web");

const GALLERY_PAGES: Array<{ name: string; path: string }> = [
  { name: "home", path: "/" },
  { name: "voxlathe", path: "/c/voxlathe-example" },
  { name: "hollowlabs", path: "/c/hollowlabs-example" },
  { name: "plainfield", path: "/c/plainfield-example" }
];

// The Task 5 card object shell, behind ?face=new. Desktop only for now: the pocket (mobile)
// treatment is Task 9's, so a mobile capture here would just be the desktop grid squeezed down,
// not the real design.
const NEW_FACE_PAGES: Array<{ name: string; path: string }> = [
  { name: "voxlathe-newface", path: "/c/voxlathe-example?face=new" },
  { name: "hollowlabs-newface", path: "/c/hollowlabs-example?face=new" },
  { name: "plainfield-newface", path: "/c/plainfield-example?face=new" }
];

test.describe("web gallery", () => {
  for (const { name, path: pagePath } of GALLERY_PAGES) {
    test(`captures ${name}`, async ({ page }, testInfo) => {
      const response = await page.goto(pagePath);
      expect(response?.ok()).toBe(true);
      await page.waitForTimeout(400);

      const screenshotDir = path.join(SCREENSHOT_ROOT, testInfo.project.name);
      fs.mkdirSync(screenshotDir, { recursive: true });
      await page.screenshot({ fullPage: true, path: path.join(screenshotDir, `${name}.png`) });
    });
  }

  for (const { name, path: pagePath } of NEW_FACE_PAGES) {
    test(`captures ${name}`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "desktop", "new face gallery is desktop-only until Task 9's pocket card lands");

      const response = await page.goto(pagePath);
      expect(response?.ok()).toBe(true);
      await page.waitForTimeout(400);

      const screenshotDir = path.join(SCREENSHOT_ROOT, testInfo.project.name);
      fs.mkdirSync(screenshotDir, { recursive: true });
      await page.screenshot({ fullPage: true, path: path.join(screenshotDir, `${name}.png`) });
    });
  }
});
