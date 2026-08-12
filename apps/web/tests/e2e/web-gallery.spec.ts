import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";

// One run of this spec writes every page's screenshot under the same timestamped directory, one
// subfolder per viewport project, so a single `npm run qa:web:gallery` produces one comparable
// set. This is the fixture gallery the rest of the landing/public-card redesign iterates and
// screenshots against. Task 10 swapped /c/{slug} over to the catalogue face and retired
// CardShell, so the plain paths below now capture that face directly; there is no more
// ?face=new variant to capture separately. home.png now captures the real landing page (Task
// 17): hero, PitchBook comparison, sources legend, extension panel, access form, footer.
//
// The desktop and mobile projects each load this module in their own worker process, so the
// timestamp is anchored once in playwright.config.ts (loaded once by the CLI, inherited by every
// worker) rather than computed inline here, where it would differ per project.
const RUN_TIMESTAMP = process.env.COLD_START_GALLERY_RUN_TIMESTAMP ?? new Date().toISOString().replace(/[:.]/g, "-");
const SCREENSHOT_ROOT = path.join(os.homedir(), "Downloads", "cold-start-qa", RUN_TIMESTAMP, "web");

const GALLERY_PAGES: Array<{ name: string; path: string }> = [
  { name: "home", path: "/" },
  { name: "catalog", path: "/catalog" },
  { name: "voxlathe", path: "/c/voxlathe-example" },
  { name: "hollowlabs", path: "/c/hollowlabs-example" },
  { name: "plainfield", path: "/c/plainfield-example" }
];

test.describe("web gallery", () => {
  for (const { name, path: pagePath } of GALLERY_PAGES) {
    test(`captures ${name}`, async ({ page }, testInfo) => {
      // voxlathe and hollowlabs capture on mobile too (Task 9's pocket card): the default
      // screenshot lands on the Card tab for both. plainfield's mobile capture stays out of
      // scope for this gallery pass.
      const isMobile = testInfo.project.name === "mobile";
      test.skip(isMobile && name === "plainfield", "plainfield's mobile pocket capture is out of scope for Task 9");

      const response = await page.goto(pagePath);
      expect(response?.ok()).toBe(true);
      await page.waitForTimeout(400);

      const screenshotDir = path.join(SCREENSHOT_ROOT, testInfo.project.name);
      fs.mkdirSync(screenshotDir, { recursive: true });
      await page.screenshot({ fullPage: true, path: path.join(screenshotDir, `${name}.png`) });
    });
  }

  // The Task 9 pocket card's divider tabs, mobile only: voxlathe (the rich fixture) walks
  // through People, Signals, and Sources on top of the Card-tab capture the loop above already
  // takes, landing at 4 total mobile screenshots for this fixture.
  test("captures voxlathe pocket tabs on mobile", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "pocket tabs only exist on the mobile face");

    const response = await page.goto("/c/voxlathe-example");
    expect(response?.ok()).toBe(true);
    await page.waitForTimeout(400);

    const screenshotDir = path.join(SCREENSHOT_ROOT, testInfo.project.name);
    fs.mkdirSync(screenshotDir, { recursive: true });

    const pocketTabs: Array<{ label: string; name: string }> = [
      { label: "People", name: "voxlathe-pocket-people" },
      { label: "Signals", name: "voxlathe-pocket-signals" },
      { label: "Sources", name: "voxlathe-pocket-sources" }
    ];

    for (const { label, name } of pocketTabs) {
      await page.getByRole("tab", { name: label }).click();
      await page.waitForTimeout(200);
      await page.screenshot({ fullPage: true, path: path.join(screenshotDir, `${name}.png`) });
    }
  });

  // The Task 8 citation choreography: hover an inline [n] mark and its sources-rail row lights
  // up, click to hold the pairing. Money is always the card's first section row, so the first
  // citation mark inside the first row is the first Money citation regardless of fixture.
  test("captures voxlathe hover and held citation states", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "the hover/held choreography capture is desktop-only");

    const response = await page.goto("/c/voxlathe-example");
    expect(response?.ok()).toBe(true);
    await page.waitForTimeout(400);

    const screenshotDir = path.join(SCREENSHOT_ROOT, testInfo.project.name);
    fs.mkdirSync(screenshotDir, { recursive: true });

    const firstMoneyCite = page.locator(".cs-face-sections .cs-face-row").first().locator("[data-cite-id]").first();

    await firstMoneyCite.hover();
    await expect(firstMoneyCite).toHaveAttribute("data-on", "true");
    await page.screenshot({ fullPage: true, path: path.join(screenshotDir, "voxlathe-hover.png") });

    await firstMoneyCite.click();
    await expect(firstMoneyCite).toHaveAttribute("data-on", "true");
    await page.screenshot({ fullPage: true, path: path.join(screenshotDir, "voxlathe-held.png") });
  });

  // Task 12's /catalog row hover: the Task 8 acknowledgment language (cat-hold ground, inset
  // seal bar, translateX(3px)) applied as a plain CSS :hover this time, no held/paired state to
  // exercise. Desktop-only, matching the citation hover capture above. Unlike the citation mark
  // (a JS-driven data-on attribute that survives any amount of scrolling), :hover tracks the
  // real cursor position: a fullPage screenshot on this page (5000+px of rows against a 1200px
  // viewport) scrolls well past the hovered row while stitching and silently drops the hover by
  // the final frame. A plain viewport screenshot after scrolling the row to a known position
  // avoids that trap entirely.
  test("captures a hovered catalog row on desktop", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "the row hover capture is desktop-only");

    const response = await page.goto("/catalog");
    expect(response?.ok()).toBe(true);
    await page.waitForTimeout(400);

    const screenshotDir = path.join(SCREENSHOT_ROOT, testInfo.project.name);
    fs.mkdirSync(screenshotDir, { recursive: true });

    const voxlatheRow = page.locator('.cs-catalog-row[href="/c/voxlathe-example"]');
    await voxlatheRow.scrollIntoViewIfNeeded();
    await voxlatheRow.hover();
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(screenshotDir, "catalog-hover.png") });
  });

  // Task 17's landing page: the honest access form, scrolled to and captured at rest (idle
  // state, no submission). A mocked route response is out of scope here per the task brief; the
  // success/error copy states are covered by the AccessForm unit coverage instead.
  test("captures the landing access form at rest", async ({ page }, testInfo) => {
    const response = await page.goto("/");
    expect(response?.ok()).toBe(true);
    await page.waitForTimeout(400);

    const screenshotDir = path.join(SCREENSHOT_ROOT, testInfo.project.name);
    fs.mkdirSync(screenshotDir, { recursive: true });

    const form = page.locator(".cs-landing-access-form");
    await form.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(screenshotDir, "landing-access-form.png") });
  });

  // The record exhibit's ticks draw once when a pair scrolls into view, so the fullPage "home"
  // capture (which never scrolls the pairs in) shows them undrawn. This capture scrolls each
  // pair into view, lets the staggered draw settle, then screenshots each pair plus the stack,
  // desktop and mobile (the mobile frames are the stacked their-panel-first layout).
  test("captures the record exhibit with ticks settled", async ({ page }, testInfo) => {
    const response = await page.goto("/");
    expect(response?.ok()).toBe(true);
    await page.waitForTimeout(400);

    const screenshotDir = path.join(SCREENSHOT_ROOT, testInfo.project.name);
    fs.mkdirSync(screenshotDir, { recursive: true });

    const stack = page.locator(".cs-exhibit-stack");
    await stack.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(screenshotDir, "exhibit-stack.png") });

    const pairs = page.locator(".cs-exhibit-pair");
    const pairCount = await pairs.count();
    for (let index = 0; index < pairCount; index += 1) {
      const pair = pairs.nth(index);
      await pair.scrollIntoViewIfNeeded();
      // Draw starts when the desk passes the -80px inView margin; the last tick's stagger
      // delay tops out under 500ms, plus the spring settle.
      await page.waitForTimeout(900);
      await pair.screenshot({ path: path.join(screenshotDir, `exhibit-pair-${index + 1}.png`) });
    }
  });

  // Task 18's recorded-build hero animation: three beats of the same run, timed off the real
  // stage machine (RecordedBuild.tsx) rather than fixed guesses. Stage 0 holds until 600ms after
  // the card scrolls into view (immediate on desktop: the hero sits in the first viewport), then
  // one stage fires every 850ms up to stage 6: stage 3 lands at 600 + 2*850 = 2300ms, stage 6 at
  // 600 + 5*850 = 4850ms. Captures land partway between stage marks so the spring settle for that
  // stage has visibly finished. Desktop-only: below 700px the component renders the finished card
  // statically with no clippings, so there is no build sequence to catch mid-flight, and the
  // "home" capture above already shows that static mobile state at 400ms.
  test("captures the recorded-build hero mid-animation", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "the animation beats are desktop-only; mobile renders statically");

    const response = await page.goto("/");
    expect(response?.ok()).toBe(true);

    const screenshotDir = path.join(SCREENSHOT_ROOT, testInfo.project.name);
    fs.mkdirSync(screenshotDir, { recursive: true });

    // Initial: well before the 600ms start delay, every clipping and section still at rest.
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(screenshotDir, "hero-build-initial.png") });

    // Mid-build: stage 3 fired at 2300ms (three clippings and three sections filed, one of each
    // still pending); wait the remaining time from "initial" plus a settle buffer.
    await page.waitForTimeout(2500 - 150);
    await page.screenshot({ path: path.join(screenshotDir, "hero-build-mid.png") });

    // Finished: stage 6 fired at 4850ms (FILED stamp settled, seal maxed); wait the remaining
    // time from "mid" plus a buffer for the stamp's spring to visibly stop moving.
    await page.waitForTimeout(5400 - 2500);
    await page.screenshot({ path: path.join(screenshotDir, "hero-build-finished.png") });
  });
});
