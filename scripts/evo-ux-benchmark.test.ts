import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { chromium } from "@playwright/test";

import { inspectPage } from "./evo-ux-benchmark";

describe("UX benchmark overflow allowances", () => {
  it("allows the measured overhang and catches larger overflow on the same element", async () => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 320, height: 240 } });
      await page.setContent(`
        <style>body { margin: 0; } .subject { width: 100px; height: 40px; }</style>
        <div class="subject cs-face-object"><div style="width: 109px; height: 20px"></div></div>
      `);
      assert.equal((await inspectPage(page)).overflowCount, 0);

      await page.locator(".subject > div").evaluate((element) => {
        (element as HTMLElement).style.width = "111px";
      });
      const inspected = await inspectPage(page);
      assert.equal(inspected.overflowCount, 1);
      assert.match(inspected.overflowSamples[0] ?? "", /cs-face-object/);
    } finally {
      await browser.close();
    }
  });
});
