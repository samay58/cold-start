import { chromium } from "@playwright/test";
const b = await chromium.launch({ channel: "chrome" }); const p = await b.newPage({ viewport: { width: 1800, height: 1200 }, deviceScaleFactor: 2 });
await p.goto("file://" + process.cwd() + "/d1.html"); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(400);
await p.screenshot({ path: "d1-all.png", fullPage: true });
const frames = await p.$$(".frame");
for (let i = 0; i < frames.length; i++) await frames[i].screenshot({ path: `d1-f${i}.png` });
console.log("plates", await p.$$eval(".lens", els => els.map(e => Math.round(e.getBoundingClientRect().height))));
await b.close();
