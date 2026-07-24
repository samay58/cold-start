import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { installLensGalleryPhase, type LensGalleryPhaseId } from "./lens-gallery-fixtures";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../..");
const OUTPUT_DIR = path.join(REPO_ROOT, "docs/product/chrome-web-store-alpha/assets");
const FONT_DIR = path.join(REPO_ROOT, "apps/extension/public/fonts");

type ProductCapture = {
  image: Buffer;
  domain: string;
};

type StoreScreenshot = {
  filename: string;
  index: string;
  label: string;
  heading: string;
  body: string;
  domain: string;
  image: Buffer;
  imageOffsetY: number;
};

function dataUrl(buffer: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

function fontFace(name: string, filename: string): string {
  const source = dataUrl(fs.readFileSync(path.join(FONT_DIR, filename)), "font/woff2");
  return `@font-face { font-family: "${name}"; src: url("${source}") format("woff2"); font-style: normal; font-weight: 100 900; }`;
}

async function openPhase(page: Page, phaseId: LensGalleryPhaseId) {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.addInitScript(() => {
    localStorage.setItem("coldStartThemeEffective", "light");
    localStorage.setItem("coldStartThemePreference", "light");
  });
  await installLensGalleryPhase(page, phaseId);
  await page.goto(`/sidepanel.html?fixture=${phaseId}`);
  await expect(page.locator("#root > *")).toHaveCount(1);
  await expect(page.locator('.cs-panel-stage-scene[data-panel="loading"]')).toHaveCount(0);
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "light";
    document.documentElement.dataset.themeReason = "manual";
  });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  if (phaseId === "ready") {
    await expect(page.getByRole("button", { name: "Run Investor Lens" })).toBeVisible();
    await expect(page.locator(".cs-card-tray")).toBeVisible();
  }
  if (phaseId === "read-full") {
    await expect(page.getByRole("article", { name: "Investor read" })).toBeVisible();
  }
  await page.waitForTimeout(300);
}

async function capturePhase(
  browser: Browser,
  phaseId: LensGalleryPhaseId,
  pinPerson?: string
): Promise<ProductCapture> {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:5173",
    colorScheme: "light",
    deviceScaleFactor: 2,
    reducedMotion: "reduce",
    viewport: { width: 420, height: 900 }
  });
  const page = await context.newPage();
  await openPhase(page, phaseId);

  if (pinPerson) {
    const person = page.locator(".cs-people-person", { hasText: pinPerson });
    await person.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#cs-company-shared-tooltip")).toHaveAttribute("data-pinned", "true");
  }

  const domain = phaseId === "read-full"
    ? "baseten.com"
    : phaseId === "dossier"
      ? "wharfrobotics.com"
      : "loomsignal.ai";
  const image = await page.screenshot({ fullPage: true, type: "png" });
  await context.close();
  return { image, domain };
}

function sharedStyles(): string {
  return `
    ${fontFace("At Umami", "AtUmamiVAR.woff2")}
    ${fontFace("At Textual", "AtTextualVAR.woff2")}
    ${fontFace("IBM Plex Sans", "IBMPlexSansVAR.woff2")}

    :root {
      --ground: #e4dcc8;
      --paper: #f4eddc;
      --plate: #fffdf8;
      --field: #f7f5ee;
      --ink: #171a1f;
      --muted: #68706a;
      --rule: #ccc7b8;
      --rule-strong: #9c978a;
      --seal: #6e5c9e;
    }

    * { box-sizing: border-box; }
    html, body { margin: 0; overflow: hidden; }
    body {
      color: var(--ink);
      background: var(--ground);
      font-family: "IBM Plex Sans", sans-serif;
      -webkit-font-smoothing: antialiased;
      text-rendering: geometricPrecision;
    }
  `;
}

function screenshotHtml(spec: StoreScreenshot): string {
  return `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          ${sharedStyles()}
          html, body { width: 1280px; height: 800px; }
          body::before {
            content: "";
            position: absolute;
            inset: 28px;
            border: 1px solid color-mix(in srgb, var(--rule-strong) 62%, transparent);
            border-radius: 8px;
            pointer-events: none;
          }
          .brand {
            position: absolute;
            top: 66px;
            left: 76px;
            display: flex;
            align-items: center;
            gap: 10px;
            font: 680 17px/1 "At Umami", sans-serif;
          }
          .brand-mark {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: var(--seal);
          }
          .copy {
            position: absolute;
            top: 202px;
            left: 76px;
            width: 565px;
          }
          .index {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 24px;
            color: var(--muted);
            font: 520 12px/1 "At Textual", monospace;
          }
          .index::after {
            content: "";
            width: 54px;
            height: 1px;
            background: var(--rule-strong);
          }
          h1 {
            max-width: 555px;
            margin: 0;
            font: 690 44px/1.06 "At Umami", sans-serif;
            letter-spacing: -0.032em;
          }
          p {
            max-width: 490px;
            margin: 26px 0 0;
            color: #4f5652;
            font: 430 18px/1.55 "IBM Plex Sans", sans-serif;
          }
          .panel {
            position: absolute;
            top: 40px;
            right: 64px;
            width: 436px;
            height: 720px;
            overflow: hidden;
            border: 1px solid var(--rule-strong);
            border-radius: 8px;
            background: var(--field);
            box-shadow: 0 12px 32px rgb(32 32 30 / 0.12);
          }
          .panel-head {
            position: relative;
            z-index: 2;
            height: 42px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 14px 0 16px;
            border-bottom: 1px solid var(--rule);
            background: var(--plate);
          }
          .panel-head strong {
            font: 640 12px/1 "At Umami", sans-serif;
          }
          .panel-head span {
            color: var(--muted);
            font: 500 10px/1 "At Textual", monospace;
          }
          .panel-viewport {
            position: relative;
            width: 420px;
            height: 678px;
            margin: 0 auto;
            overflow: hidden;
            background: var(--field);
          }
          .panel-viewport img {
            display: block;
            width: 420px;
            height: auto;
            transform: translateY(${spec.imageOffsetY}px);
          }
        </style>
      </head>
      <body>
        <div class="brand"><span class="brand-mark"></span><span>Cold Start</span></div>
        <main class="copy">
          <div class="index"><span>${spec.index}</span><span>${spec.label}</span></div>
          <h1>${spec.heading}</h1>
          <p>${spec.body}</p>
        </main>
        <section class="panel" aria-label="Cold Start side panel">
          <div class="panel-head"><strong>Cold Start</strong><span>${spec.domain}</span></div>
          <div class="panel-viewport">
            <img src="${dataUrl(spec.image, "image/png")}" alt="">
          </div>
        </section>
      </body>
    </html>`;
}

function promoHtml(): string {
  return `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          ${sharedStyles()}
          html, body { width: 440px; height: 280px; }
          .sheet {
            position: absolute;
            inset: 18px;
            padding: 28px 30px;
            border: 1px solid var(--rule-strong);
            border-radius: 7px;
            background: var(--plate);
            box-shadow: 0 7px 18px rgb(32 32 30 / 0.10);
          }
          .brand {
            display: flex;
            align-items: center;
            gap: 8px;
            font: 680 16px/1 "At Umami", sans-serif;
          }
          .brand-mark {
            width: 9px;
            height: 9px;
            border-radius: 50%;
            background: var(--seal);
          }
          .rule {
            width: 48px;
            height: 1px;
            margin: 24px 0 17px;
            background: var(--rule-strong);
          }
          h1 {
            width: 330px;
            margin: 0;
            font: 710 31px/1.08 "At Umami", sans-serif;
            letter-spacing: -0.025em;
          }
          p {
            margin: 17px 0 0;
            color: var(--muted);
            font: 450 14px/1.35 "IBM Plex Sans", sans-serif;
          }
        </style>
      </head>
      <body>
        <main class="sheet">
          <div class="brand"><span class="brand-mark"></span><span>Cold Start</span></div>
          <div class="rule"></div>
          <h1>Understand the company behind the tab.</h1>
          <p>Sourced profiles in your Chrome side panel.</p>
        </main>
      </body>
    </html>`;
}

async function renderHtml(browser: Browser, html: string, width: number, height: number, outputPath: string) {
  const context = await browser.newContext({
    deviceScaleFactor: 1,
    viewport: { width, height }
  });
  const page = await context.newPage();
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: outputPath, type: "png" });
  await context.close();
}

test("generates sharp Chrome Web Store assets from real extension fixtures", async ({ browser }) => {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const [lens, people] = await Promise.all([
    capturePhase(browser, "read-full"),
    capturePhase(browser, "read-full", "Tuhin Srivastava")
  ]);
  const profile = lens;

  const screenshots: StoreScreenshot[] = [
    {
      filename: "screenshot-company-profile-1280x800.png",
      index: "01",
      label: "Company profile",
      heading: "Understand a company without opening ten tabs.",
      body: "See what it does, who is involved, and the sources behind the claims.",
      domain: profile.domain,
      image: profile.image,
      imageOffsetY: 0
    },
    {
      filename: "screenshot-investor-lens-1280x800.png",
      index: "02",
      label: "Investor Lens",
      heading: "See the case from both sides.",
      body: "Why it matters, what must be true, what could break, and what to learn next. Each read stays tied to its sources.",
      domain: lens.domain,
      image: lens.image,
      imageOffsetY: -690
    },
    {
      filename: "screenshot-people-1280x800.png",
      index: "03",
      label: "People",
      heading: "Know who is behind the company.",
      body: "Open a person for their role, background, contact details, and source trail.",
      domain: people.domain,
      image: people.image,
      imageOffsetY: -330
    }
  ];

  for (const screenshot of screenshots) {
    await renderHtml(
      browser,
      screenshotHtml(screenshot),
      1280,
      800,
      path.join(OUTPUT_DIR, screenshot.filename)
    );
  }

  await renderHtml(browser, promoHtml(), 440, 280, path.join(OUTPUT_DIR, "promo-440x280.png"));

  const legacyScreenshot = path.join(OUTPUT_DIR, "screenshot-1280x800.png");
  if (fs.existsSync(legacyScreenshot)) {
    fs.rmSync(legacyScreenshot);
  }
});
