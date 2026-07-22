import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import {
  browserbaseCard,
  browserbaseCardWithInferredEmail,
  browserbaseCardWithPeople,
  browserbaseCardWithSynthesis,
  fulfillJson,
  granolaCard,
  installChromeShim,
  mockExtensionApi,
  researchPanelPolishCard
} from "./fixtures";
import { dragWithSamples, expectFocusedElementVisible, expectPointerAttached } from "./interaction-probes";

async function openSidePanel(page: Parameters<typeof installChromeShim>[0]) {
  await page.goto("/sidepanel.html");
  await expect(page.locator("#root > *")).toHaveCount(1);
}

async function setTheme(page: Parameters<typeof installChromeShim>[0], theme: "dark" | "light") {
  await page.evaluate((nextTheme) => {
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.dataset.themeReason = "manual";
  }, theme);
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
}

async function capturePolishScreenshot(
  page: Parameters<typeof installChromeShim>[0],
  name: string,
  selector?: string
) {
  const directory = process.env.COLD_START_POLISH_SCREENSHOT_DIR;
  if (!directory) {
    return;
  }
  if (selector) {
    await page.locator(selector).screenshot({ path: `${directory}/${name}.png` });
    return;
  }
  await page.screenshot({ fullPage: true, path: `${directory}/${name}.png` });
}

type CollapsedTextViolation = {
  height: number;
  parentClass: string;
  parentTag: string;
  text: string;
  width: number;
};

// Guards the one-character-per-line class of bug: a leftover multi-column CSS grid (a dot
// column with nothing left to fill it) collapses its text sibling into a track only a few
// pixels wide, so long strings wrap one glyph per line. Any visible text node longer than
// 30 characters must sit in a rendered container wider than 80px; a narrower container is a
// shattered layout, not a design choice, at that length.
async function findCollapsedLongTextViolations(
  page: Parameters<typeof installChromeShim>[0],
  rootSelector = "#root"
): Promise<CollapsedTextViolation[]> {
  return page.evaluate((selector) => {
    const MIN_TEXT_LENGTH = 30;
    const MIN_CONTAINER_WIDTH = 80;

    function isRenderedVisible(element: Element): boolean {
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") {
        return false;
      }
      return Number(style.opacity) !== 0;
    }

    // Walk to the document root so a node inside a hidden ancestor (a collapsed enrichment
    // panel, an unopened tooltip) never counts, even if its own computed style looks fine.
    function ancestorChainVisible(element: Element | null): boolean {
      let node: Element | null = element;
      while (node) {
        if (!isRenderedVisible(node)) {
          return false;
        }
        node = node.parentElement;
      }
      return true;
    }

    // A deliberate single-line ellipsis truncation is a design choice, not the collapsed-grid
    // bug: it shows a short slice of the string on purpose, not the whole string one glyph
    // per line.
    function isDeliberateSingleLineTruncation(element: Element): boolean {
      const style = getComputedStyle(element);
      return style.whiteSpace === "nowrap" && style.textOverflow === "ellipsis";
    }

    const root = document.querySelector(selector);
    if (!root) {
      return [];
    }

    const violations: CollapsedTextViolation[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    let node = walker.nextNode();
    while (node) {
      const text = (node.textContent ?? "").trim();
      const parent = node.parentElement;
      if (text.length > MIN_TEXT_LENGTH && parent && ancestorChainVisible(parent) && !isDeliberateSingleLineTruncation(parent)) {
        const rect = parent.getBoundingClientRect();
        const isRendered = rect.width > 0 || rect.height > 0;
        if (isRendered && rect.width < MIN_CONTAINER_WIDTH) {
          violations.push({
            height: Math.round(rect.height),
            parentClass: typeof parent.className === "string" ? parent.className : String(parent.className),
            parentTag: parent.tagName,
            text: text.slice(0, 70),
            width: Math.round(rect.width)
          });
        }
      }
      node = walker.nextNode();
    }
    return violations;
  }, rootSelector);
}

test("cached card renders the research layer without old analyze affordances", async ({ page }) => {
  await installChromeShim(page);
  await mockExtensionApi(page, browserbaseCardWithSynthesis());
  await openSidePanel(page);

  await expect(page.getByRole("heading", { name: "Browserbase" })).toBeVisible();
  await expect(page.getByLabel("Research layer")).toBeVisible();
  await expect(page.locator(".cs-investor-lens-control")).toHaveCount(0);
  await expect(page.locator(".cs-company-logo img")).toHaveAttribute("src", /icons\.duckduckgo\.com\/ip3\/browserbase\.com\.ico/);
  await expect(page.locator(".cs-research-brand")).toHaveCount(0);
  await expect(page.locator(".cs-extension-brand")).toHaveCount(0);
  await expect(page.locator(".cs-extension-mark")).toHaveCount(0);
  await expect(page.getByLabel("Research card stack")).toBeVisible();
  await expect(page.locator(".cs-card-tray-head")).toContainText("Research stack");
  await expect(page.locator(".cs-dormant-card").first()).toHaveAttribute("aria-label", /File .* into Research/);
  await expect(page.locator(".cs-dormant-card-index").first()).toHaveText("01");
  await expect(page.locator(".cs-dormant-card-index i")).toHaveCount(0);
  await expect(page.locator(".cs-card-plus")).toHaveCount(0);
  await expect(page.getByRole("article", { name: "Investor read" })).toContainText(
    "Browserbase turns browser automation into agent infrastructure"
  );
  await expect(page.getByLabel("Company context").getByRole("link", { name: "browserbase.com" })).toHaveAttribute("target", "_blank");
  await expect(page.getByText("[c1]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Analyze" })).toHaveCount(0);
  await page.screenshot({ fullPage: true, path: "/private/tmp/cold-start-extension-rest.png" });
});

for (const reducedMotion of [false, true]) {
  test(`all research cards filed removes the tray and orphaned frames (${reducedMotion ? "reduced" : "full"} motion)`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: reducedMotion ? "reduce" : "no-preference" });
    await installChromeShim(page);
    await mockExtensionApi(page, browserbaseCardWithSynthesis());
    await openSidePanel(page);

    const dormantCards = page.locator(".cs-dormant-card");
    await expect(dormantCards).toHaveCount(6);

    for (let waiting = 6; waiting > 0; waiting -= 1) {
      await dormantCards.first().click();
      await expect(dormantCards).toHaveCount(waiting - 1);
    }

    await expect(page.locator(".cs-dormant-card-frame")).toHaveCount(0);
    await expect(page.getByLabel("Research card stack")).toHaveCount(0);
  });
}

for (const reducedMotion of [false, true]) {
  test(`source-less layer and empty memo stay compact (${reducedMotion ? "reduced" : "full"} motion)`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: reducedMotion ? "reduce" : "no-preference" });
    await installChromeShim(page);
    await mockExtensionApi(page, researchPanelPolishCard());
    await openSidePanel(page);

    const memo = page.getByRole("article", { name: "Investor read" });
    await expect(memo.locator(".cs-lens-tension-side")).toHaveCount(0);
    await expect(memo.locator(".cs-lens-case-empty")).toContainText("No bull or break claim survived verification.");

    const comps = page.locator(".cs-dormant-card", { hasText: "Comps" });
    await comps.click();
    const activeComps = page.locator('.cs-active-enrichment[data-layer-id="competition"]');
    await expect(activeComps).toBeVisible();
    await expect(activeComps.locator(".cs-source-chips")).toHaveCount(0);
  });
}

for (const theme of ["light", "dark"] as const) {
  test(`research panel polish states render in ${theme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "no-preference" });
    await installChromeShim(page);
    await mockExtensionApi(page, researchPanelPolishCard());
    await openSidePanel(page);
    await setTheme(page, theme);

    await capturePolishScreenshot(page, `${theme}-memo`, '.cs-investor-read');
    await capturePolishScreenshot(page, `${theme}-tray-present`, '.cs-card-tray');

    await page.locator(".cs-dormant-card", { hasText: "Money" }).click();
    const money = page.locator('.cs-active-enrichment[data-layer-id="investors"]');
    await expect(money).toBeVisible();
    await capturePolishScreenshot(page, `${theme}-money`, '.cs-active-enrichment[data-layer-id="investors"]');

    const dormantCards = page.locator(".cs-dormant-card");
    for (let waiting = 5; waiting > 0; waiting -= 1) {
      await dormantCards.first().click();
      await expect(dormantCards).toHaveCount(waiting - 1);
    }
    await expect(page.locator(".cs-dormant-card-frame")).toHaveCount(0);
    await capturePolishScreenshot(page, `${theme}-tray-absent`);
    await expect(page.getByLabel("Research card stack")).toHaveCount(0);
  });
}

test("research layer cards use one plate without nested bordered groups", async ({ page }) => {
  await installChromeShim(page);
  await mockExtensionApi(page, researchPanelPolishCard({ multiRound: true }));
  await openSidePanel(page);

  for (const title of ["Money", "Signals", "Comps", "Product"]) {
    await page.locator(".cs-dormant-card", { hasText: title }).click();
  }

  const nestedSelectors = [
    ".cs-layer-money-hero",
    ".cs-layer-money-ledger ol",
    ".cs-layer-signal-ledger",
    ".cs-layer-rows div",
    ".cs-layer-items li",
    ".cs-source-chip"
  ];
  for (const selector of nestedSelectors) {
    const elements = page.locator(selector);
    for (let index = 0; index < await elements.count(); index += 1) {
      await expect(elements.nth(index)).toHaveCSS("border-right-width", "0px");
      await expect(elements.nth(index)).toHaveCSS("border-bottom-width", "0px");
      await expect(elements.nth(index)).toHaveCSS("border-left-width", "0px");
      await expect(elements.nth(index)).toHaveCSS("border-radius", "0px");
    }
  }
});

test("multi-round Money stays one plate and source overflow stays reachable", async ({ page }) => {
  await installChromeShim(page);
  await mockExtensionApi(page, researchPanelPolishCard({ multiRound: true }));
  await openSidePanel(page);

  await page.locator(".cs-dormant-card", { hasText: "Money" }).click();
  const money = page.locator('.cs-active-enrichment[data-layer-id="investors"]');
  await expect(money.locator(".cs-layer-money-ledger li")).toHaveCount(1);
  await expect(money).toContainText("Series A");
  await expect(money).toContainText("$46M");
  await expect(money.locator(".cs-layer-money-ledger ol")).toHaveCSS("border-left-width", "0px");

  await page.locator(".cs-dormant-card", { hasText: "Product" }).click();
  const product = page.locator('.cs-active-enrichment[data-layer-id="mechanism"]');
  await expect(product.locator("a.cs-source-chip")).toHaveCount(3);
  const sourceOverflow = product.locator(".cs-source-more");
  await expect(sourceOverflow).toHaveText("+1");
  await sourceOverflow.focus();
  await expect(page.locator("#cs-company-shared-tooltip")).toContainText("Also cited");
});

test("investor read stays bounded and honest with long partial synthesis", async ({ page }) => {
  const card = browserbaseCardWithSynthesis();
  card.synthesis = {
    whyItMatters: {
      text: "Physician burnout from documentation is a documented operational crisis for health systems, and ambient AI scribes are the first workflow-native solution that does not ask doctors to change the clinical visit [c1].",
      citationIds: ["c1"]
    },
    bullCase: [
      {
        text: "Rush University Medical Center's expansion to an enterprise-wide rollout after a successful pilot is proof that the product can move from department-level trial to broad health-system deployment [c2].",
        citationIds: ["c2"]
      }
    ],
    bearCase: [],
    openQuestions: [
      {
        question: "What is the average number of active physician seats per health system customer, and what does seat utilization look like 12 months after go-live?",
        category: "buyer_budget",
        wouldChangeReadIf: "Seat utilization holds above pilot levels a year after go-live."
      }
    ]
  };

  await installChromeShim(page);
  await mockExtensionApi(page, card);
  await openSidePanel(page);

  const investorRead = page.getByRole("article", { name: "Investor read" });
  await expect(investorRead).toBeVisible();
  await expect(investorRead).toContainText("Physician burnout from documentation");

  // The tension pair keeps the surviving bull claim and states the missing bear side honestly.
  await expect(investorRead).toContainText("If true");
  await expect(investorRead).toContainText("Rush University Medical Center");
  await expect(investorRead).toContainText("It breaks if");
  await expect(investorRead).toContainText("No breaking claim survived verification.");

  // Unsupported timing is a clean not-found row, never an unfinished-generation state.
  await expect(investorRead.locator(".cs-lens-timing")).toContainText("Not supported by current sources.");
  await expect(investorRead).not.toContainText("has not been generated");

  // The ranked question carries its category and what answer would change the read.
  await expect(investorRead.locator(".cs-lens-question")).toContainText("Buyer & budget");
  await expect(investorRead.locator(".cs-lens-question")).toContainText("active physician seats");
  await expect(investorRead.locator(".cs-lens-question")).toContainText("Changes the read if");

  // Evidence closes the card in one footer: classed source links and the filed date.
  await expect(investorRead.locator(".cs-lens-source").first()).toBeVisible();
  await expect(investorRead.locator(".cs-lens-footer-filed")).toContainText("Filed");

  const hasNoHorizontalOverflow = await investorRead.evaluate((element) =>
    element.scrollWidth <= element.clientWidth + 1
  );
  expect(hasNoHorizontalOverflow).toBe(true);

  await investorRead.screenshot({ path: "/private/tmp/cold-start-investor-read-long.png" });
  await page.screenshot({ fullPage: true, path: "/private/tmp/cold-start-investor-read-long-panel.png" });
});

test("no long text renders in a collapsed track", async ({ page }) => {
  const card = browserbaseCardWithSynthesis();
  card.synthesis = {
    whyItMatters: {
      text: "Physician burnout from documentation is a documented operational crisis for health systems, and ambient AI scribes are the first workflow-native solution that does not ask doctors to change the clinical visit [c1].",
      citationIds: ["c1"]
    },
    bullCase: [
      {
        text: "Rush University Medical Center's expansion to an enterprise-wide rollout after a successful pilot is proof that the product can move from department-level trial to broad health-system deployment [c2].",
        citationIds: ["c2"]
      }
    ],
    bearCase: [
      {
        text: "Documentation-adjacent incumbents with existing EHR integrations could bundle a comparable ambient scribe feature and erode the standalone product's differentiation [c1].",
        citationIds: ["c1"]
      }
    ],
    openQuestions: [
      {
        question: "What is the average number of active physician seats per health system customer, and what does seat utilization look like 12 months after go-live?",
        category: "buyer_budget",
        wouldChangeReadIf: "Seat utilization holds above pilot levels a year after go-live."
      }
    ]
  };

  await installChromeShim(page);
  await mockExtensionApi(page, card);
  await openSidePanel(page);

  const investorRead = page.getByRole("article", { name: "Investor read" });
  await expect(investorRead).toBeVisible();
  // Exercise every row that shattered in the regression: the lede, and both sides of the
  // tension pair (previously commit 827bff8 left an orphaned dot-column grid under all three).
  await expect(investorRead).toContainText("Physician burnout from documentation");
  await expect(investorRead).toContainText("Rush University Medical Center");
  await expect(investorRead).toContainText("Documentation-adjacent incumbents");

  const violations = await findCollapsedLongTextViolations(page);
  expect(
    violations,
    `Long text rendered inside a collapsed-width container (a leftover grid track with no sibling left to fill it):\n${JSON.stringify(violations, null, 2)}`
  ).toEqual([]);
});

test("granola signals module clusters duplicate raise coverage into corroborated events", async ({ page }) => {
  await installChromeShim(page, { activeDomain: "granola.ai" });
  await mockExtensionApi(page, granolaCard());
  await openSidePanel(page);

  await expect(page.getByRole("heading", { name: "Granola" })).toBeVisible();
  const dormantSignals = page.locator(".cs-dormant-card", { hasText: "Signals" });
  await dormantSignals.scrollIntoViewIfNeeded();
  await dormantSignals.focus();
  await page.keyboard.press("Enter");

  const active = page.locator('.cs-active-enrichment[data-layer-id="signals"]');
  await expect(active).toBeVisible();
  await expect(active).toHaveAttribute("data-expanded", "true");

  // 10 raw signals, 8 covering the same raise: the module renders 3 events with honest counts.
  await expect(active.locator(".cs-active-enrichment-head small")).toHaveText("3 events · 10 sources");
  const rows = active.locator(".cs-layer-signal-ledger li");
  await expect(rows).toHaveCount(3);
  await expect(active.getByText("×8 corroborated")).toBeVisible();
  // Headlines lead each row; category words stay in the quiet metadata line, never bolded.
  await expect(rows.locator("strong").first()).not.toHaveText(/^(funding|news|launch|hiring|filing|github|other)$/);
  await expect(active.getByText("Granola raises $125M at $1.5B valuation", { exact: false })).toBeVisible();
  await expect(rows.filter({ hasText: "raises $125M" })).toHaveCount(1);

  await active.scrollIntoViewIfNeeded();
  await page.waitForTimeout(450);
  await active.screenshot({ path: "/private/tmp/cold-start-granola-signals.png" });
  await page.screenshot({ fullPage: true, path: "/private/tmp/cold-start-granola-panel.png" });
});

test("summary tooltip opens from keyboard focus and clears on blur", async ({ page }) => {
  const longSummary = [
    "Browserbase gives AI teams a managed browser workbench for agents that need to navigate real sites, preserve session state, and observe what happened after each run.",
    "It packages browser sessions, proxies, instrumentation, and automation APIs so developers can file the messy web-navigation layer behind one infrastructure surface.",
    "The company matters when agent products move from demos to repeatable workflows that need stable browsers, traceable logs, and a clean handoff back to human operators."
  ].join(" ");
  const card = browserbaseCard({
    identity: {
      ...browserbaseCard().identity,
      description: {
        value: {
          shortDescription: longSummary,
          concept: "Managed browser infrastructure for AI agent workflows.",
          serves: "AI application developers and automation teams.",
          mechanism: "Hosted browser sessions, proxies, observability, and automation APIs."
        },
        status: "verified",
        confidence: "medium",
        citationIds: ["c1", "c2", "c3"]
      }
    }
  });

  await installChromeShim(page);
  await mockExtensionApi(page, card);
  await openSidePanel(page);

  const summary = page.locator(".cs-company-summary-more");
  await expect(summary).toBeVisible();
  await expect(summary).toHaveText("(more)");
  await expect(summary).toHaveAttribute("aria-describedby", "cs-company-shared-tooltip");
  await summary.focus();
  await expectFocusedElementVisible(page);

  const tooltip = page.locator("#cs-company-shared-tooltip");
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText("Description");
  await expect(tooltip).toContainText("Managed browser infrastructure for AI agent workflows");
  await expect(tooltip).toHaveAttribute("data-placement", "below");

  await summary.evaluate((element) => {
    (element as HTMLButtonElement).blur();
  });
  await expect(tooltip).toHaveCount(0);
});

test("keyboard-reachable controls keep visible focus targets", async ({ page }) => {
  await installChromeShim(page);
  await mockExtensionApi(page, browserbaseCardWithSynthesis());
  await openSidePanel(page);

  const controls = [
    page.getByLabel("Company context").getByRole("link", { name: "browserbase.com" }),
    page.getByRole("article", { name: "Investor read" }).locator(".cs-lens-source").first(),
    page.locator(".cs-dormant-card", { hasText: "Who pays" }),
    page.locator(".cs-dormant-card", { hasText: "Money" })
  ];

  for (const control of controls) {
    await control.scrollIntoViewIfNeeded();
    await control.focus();
    await expect(control).toBeFocused();
    await expectFocusedElementVisible(page);
  }
});

test("no-source partial card auto-regenerates before rendering the dossier", async ({ page }) => {
  const generateRequests: Array<{ mode?: string }> = [];
  let generationStarted = false;
  const partialCard = browserbaseCard({
    slug: "databricks",
    domain: "databricks.com",
    cacheStatus: "partial",
    identity: {
      ...browserbaseCard().identity,
      name: { value: "databricks.com", status: "unknown", confidence: "low", citationIds: [] },
      websiteUrl: { value: null, status: "unknown", confidence: "low", citationIds: [] },
      oneLiner: { value: null, status: "unknown", confidence: "low", citationIds: [] },
      hq: { value: null, status: "unknown", confidence: "low", citationIds: [] },
      foundedYear: { value: null, status: "unknown", confidence: "low", citationIds: [] }
    },
    funding: {
      totalRaisedUsd: { value: null, status: "unknown", confidence: "low", citationIds: [] },
      lastRound: { value: null, status: "unknown", confidence: "low", citationIds: [] },
      investors: { value: null, status: "unknown", confidence: "low", citationIds: [] }
    },
    team: {
      founders: { value: [], status: "unknown", confidence: "low", citationIds: [] },
      keyExecs: { value: [], status: "unknown", confidence: "low", citationIds: [] },
      headcount: { value: null, status: "unknown", confidence: "low", citationIds: [] }
    },
    signals: [],
    comparables: [],
    citations: []
  });
  const usableCard = browserbaseCard({
    slug: "databricks",
    domain: "databricks.com",
    identity: {
      ...browserbaseCard().identity,
      name: { value: "Databricks", status: "verified", confidence: "high", citationIds: ["c1"] },
      websiteUrl: { value: "https://databricks.com/", status: "verified", confidence: "high", citationIds: ["c1"] }
    }
  });
  await installChromeShim(page, { activeDomain: "databricks.com" });
  await page.route("**/api/extension/bootstrap?**", async (route) => {
    await fulfillJson(route, {
      domain: "databricks.com",
      slug: "databricks",
      card: partialCard,
      runs: {
        basics: { slug: "databricks", domain: "databricks.com", mode: "basics", status: "idle" },
        analysis: { slug: "databricks", domain: "databricks.com", mode: "analysis", status: "idle" }
      }
    });
  });
  await page.route("**/api/extension/cards/**", async (route) => {
    await fulfillJson(route, generationStarted ? usableCard : partialCard);
  });
  await page.route("**/api/generate?**", async (route) => {
    await fulfillJson(route, {
      slug: "databricks",
      domain: "databricks.com",
      status: generationStarted ? "complete" : "idle",
      mode: "basics"
    });
  });
  await page.route("**/api/generate", async (route) => {
    generationStarted = true;
    generateRequests.push(route.request().postDataJSON() as { mode?: string });
    await fulfillJson(route, { slug: "databricks", status: "queued", mode: "basics" }, 202);
  });
  await openSidePanel(page);

  await expect(page.getByRole("heading", { name: "Databricks" })).toBeVisible();
  await expect(page.getByLabel("Research layer")).toBeVisible();
  await expect(page.getByText("No cited profile yet")).toHaveCount(0);
  await expect(page.getByText("Not found")).toHaveCount(0);
  expect(generateRequests).toMatchObject([{ mode: "basics" }]);
});

test("core metrics and people stay compact in the company context", async ({ page }) => {
  await installChromeShim(page, { activeDomain: "conductor.build" });
  await mockExtensionApi(page, browserbaseCard({
    domain: "conductor.build",
    identity: {
      ...browserbaseCard().identity,
      name: { value: "Conductor", status: "verified", confidence: "high", citationIds: ["c1"] },
      websiteUrl: { value: "https://conductor.build/", status: "verified", confidence: "high", citationIds: ["c1"] },
      oneLiner: {
        value: "Conductor lets software developers run teams of AI coding agents in parallel.",
        status: "verified",
        confidence: "high",
        citationIds: ["c1"]
      },
      hq: { value: { city: "San Francisco", country: "United States" }, status: "verified", confidence: "medium", citationIds: ["c1"] },
      foundedYear: { value: 2024, status: "verified", confidence: "medium", citationIds: ["c1"] }
    },
    team: {
      founders: {
        value: [
          {
            name: "Charlie Holtz",
            role: "Co-founder & CEO",
            sourceUrl: "https://conductor.build/about",
            email: "charlie@conductor.build",
            emailStatus: "observed",
            githubUrl: "https://github.com/charlieholtz"
          },
          { name: "Jackson de Campos", role: "Co-founder", sourceUrl: "https://conductor.build/about" }
        ],
        status: "verified",
        confidence: "medium",
        citationIds: ["c1"]
      },
      headcount: {
        value: { value: 6, asOf: "2026-04-27" },
        status: "inferred",
        confidence: "low",
        citationIds: ["c2"]
      },
      keyExecs: {
        value: [
          { name: "Charlie Holtz", role: "Founder & CEO (prev. Engineer at Replicate)", sourceUrl: "https://linkedin.com/in/charlie" }
        ],
        status: "verified",
        confidence: "medium",
        citationIds: ["c2"]
      }
    },
    citations: [
      ...browserbaseCard().citations,
      {
        id: "c2",
        url: "https://linkedin.com/company/conductor-build/",
        title: "Conductor LinkedIn",
        fetchedAt: "2026-05-12T12:00:00.000Z",
        sourceType: "enrichment"
      }
    ]
  }));
  await openSidePanel(page);

  const facts = page.getByLabel("Core metrics");
  const management = page.getByLabel("Management team");
  const researchLayer = page.getByLabel("Research layer");
  await expect(facts.getByText("Employees")).toBeVisible();
  await expect(facts.locator("dd").filter({ hasText: /^6$/ })).toBeVisible();
  await expect(facts.getByText("2026-04-27")).toBeVisible();
  await expect(facts.locator("> div").first()).not.toHaveAttribute("aria-describedby", "cs-company-shared-tooltip");
  await expect(management.getByText("Charlie Holtz")).toHaveCount(1);
  await expect(management.getByText("Jackson de Campos")).toBeVisible();
  await expect(page.locator(".cs-management-team")).toHaveCount(0);
  // Contact detail stays entirely in the dossier. The visible row has no mailto or channel link.
  await expect(management.locator('a[href^="mailto:"]')).toHaveCount(0);
  await expect(management.locator('a[href="https://github.com/charlieholtz"]')).toHaveCount(0);

  const charlie = page.locator(".cs-people-person", { hasText: "Charlie Holtz" });
  await expect(charlie).toHaveAttribute("aria-describedby", "cs-company-shared-tooltip");
  await charlie.focus();
  const peopleTooltip = page.locator("#cs-company-shared-tooltip");
  await expect(peopleTooltip).toBeVisible();
  await expect(peopleTooltip).toHaveAttribute("data-variant", "dossier");
  await expect(peopleTooltip).toContainText("Charlie Holtz");
  await expect(peopleTooltip.locator(".cs-dossier-role")).toContainText("Co-founder & CEO");
  await expect(peopleTooltip.locator(".cs-dossier-channel")).toContainText("GitHub");
  // Docked contract (Task 4.1, replacing the pre-4.1 floating placement this test used to
  // assert with data-placement="above"): the dossier always docks below the whole people
  // block at a fixed, full-width-minus-margins region, never a narrow trigger-centered column
  // floating above the row. A regression back to the old per-trigger placement would flip
  // data-placement to "above" and shrink the box to roughly 240-340px, failing every
  // assertion below.
  await expect(peopleTooltip).toHaveAttribute("data-mode", "docked");
  await expect(peopleTooltip).toHaveAttribute("data-placement", "below");

  const factsBox = await facts.boundingBox();
  const managementBox = await management.boundingBox();
  const researchBox = await researchLayer.boundingBox();
  const charlieBox = await charlie.boundingBox();
  const dossierBox = await peopleTooltip.boundingBox();
  if (!managementBox || !charlieBox || !dossierBox) {
    throw new Error("Expected bounding boxes for the management block, the row, and the docked dossier");
  }
  expect(factsBox?.y).toBeLessThan(managementBox?.y ?? 0);
  expect(managementBox?.y).toBeLessThan(researchBox?.y ?? 0);
  // Below the people block's own bottom edge, never overlapping the row that opened it.
  expect(dossierBox.y).toBeGreaterThan(managementBox.y + managementBox.height - 2);
  expect(dossierBox.y).toBeGreaterThan(charlieBox.y + charlieBox.height - 2);
  // Full width minus the 16px side margins, not a narrow trigger-centered popover column.
  const viewportWidth = page.viewportSize()?.width ?? 0;
  expect(dossierBox.x).toBeLessThanOrEqual(17);
  expect(dossierBox.width).toBeGreaterThan(viewportWidth - 40);
});

test("inferred email dossier shows its basis and copies in place", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await installChromeShim(page);
  await mockExtensionApi(page, browserbaseCardWithInferredEmail());
  await openSidePanel(page);

  await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
  const person = page.locator(".cs-people-person", { hasText: "Paul Klein" });
  await person.focus();
  await page.keyboard.press("Enter");
  const tooltip = page.locator("#cs-company-shared-tooltip");
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveAttribute("data-pinned", "true");
  await expect(tooltip.locator(".cs-dossier-email-kind")).toHaveText("Inferred");
  await expect(tooltip.locator(".cs-dossier-email-address")).toHaveText("paul.klein@browserbase.com");
  await expect(tooltip.locator(".cs-dossier-email-basis")).toHaveText(
    "domain pattern first.last, 3 observed addresses"
  );
  await page.screenshot({
    fullPage: true,
    path: fileURLToPath(new URL("../../../../docs/archive/specs/screenshots/inferred-email-coverage/after/light-inferred-dossier.png", import.meta.url))
  });

  await tooltip.locator(".cs-dossier-email-copy").click();
  await expect(tooltip.locator(".cs-dossier-email-address")).toHaveText("Copied");
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("paul.klein@browserbase.com");
});

test("missing card shows an explicit generation gate and does not auto-start", async ({ page }) => {
  const generateRequests: string[] = [];
  await installChromeShim(page, { activeDomain: "legora.com" });
  await mockExtensionApi(page, null);
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/api/generate")) {
      generateRequests.push(request.url());
    }
  });

  await openSidePanel(page);

  await expect(page.getByRole("heading", { name: "Legora" })).toBeVisible();
  // The intake is the profile shell in waiting: real module titles, the sealed lens, one action.
  // The status slot renders empty; there is no "No profile" chip duplicating the intake note.
  await expect(page.getByRole("button", { name: "Begin research" })).toBeVisible();
  await expect(page.getByText("No profile")).toHaveCount(0);
  await expect(page.getByText("Build a cited profile from public sources: identity, funding, people, and proof.")).toBeVisible();
  await expect(page.getByText("Who pays", { exact: true })).toBeVisible();
  await expect(page.locator(".cs-lens-sealed")).toContainText("Investor Lens");
  expect(generateRequests).toHaveLength(0);
  await expect(page.locator('input[value="http://localhost:3000"]')).toHaveCount(0);
  await page.waitForTimeout(400);
  await page.screenshot({ fullPage: true, path: "/private/tmp/cold-start-intake.png" });
});

test("running basics progress shows the assembly whisper, seal, and clippings", async ({ page }) => {
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
      message: "Found 3 accepted sources",
      metadata: {
        acceptedCount: 3,
        sources: [
          { url: "https://cartesia.ai/", domain: "cartesia.ai", title: "Cartesia", sourceType: "company_site", imageUrl: null },
          { url: "https://docs.cartesia.ai/", domain: "docs.cartesia.ai", title: "Cartesia docs", sourceType: "company_site", imageUrl: null },
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

  await openSidePanel(page);

  // The persistent header carries the identity over the mesh field; the trail is dissolved.
  await expect(page.locator(".cs-company-context[data-phase='building']")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cartesia" })).toBeVisible();
  await expect(page.locator(".cs-build-bar")).toHaveCount(0);
  await expect(page.locator(".cs-research-progress")).toHaveCount(0);
  await expect(page.locator(".cs-trail-track")).toHaveCount(0);

  // The whisper is the one status voice: event-driven copy beside the seal instrument.
  const whisper = page.locator(".cs-assembly-whisper");
  await expect(whisper).toBeVisible();
  await expect(whisper).toContainText("3 sources, building profile");

  // The seal inks up in discrete steps tied to real stage events, not a clock.
  const seal = page.locator(".cs-seal-inst");
  await expect(seal).toHaveAttribute("data-level", "2");
  await expect(seal).toHaveAttribute("data-filed", "false");

  // Source receipts become clippings, the card's first content before any fact exists.
  await expect(page.locator(".cs-clippings")).toHaveAttribute("data-state", "settled");
  const clippings = page.locator(".cs-clipping");
  await expect(clippings).toHaveCount(3);
  await expect(clippings.nth(2)).toContainText("techcrunch.com");
  await expect(clippings.nth(2)).toContainText("Funding");

  // The full tree waits behind Details, and still carries the honest verbs when opened.
  await page.locator(".cs-assembly-details-toggle").click();
  const tree = page.locator(".cs-build-tree");
  await expect(tree).toBeVisible();
  await expect(tree).toContainText("3 sources found");
  // Prove the Drizzle loader is actually changing over time, not just declared.
  const drizzlePixel = page.locator(".cs-drizzle-loader span").first();
  await expect(drizzlePixel).toHaveCSS("animation-name", "cs-drizzle-step");
  const samples: number[] = [];
  for (let i = 0; i < 3; i += 1) {
    samples.push(Math.round(Number(await drizzlePixel.evaluate((el) => getComputedStyle(el).opacity)) * 100));
    if (i < 2) {
      await page.waitForTimeout(420);
    }
  }
  expect(new Set(samples).size, `Drizzle opacity should change over time, got ${JSON.stringify(samples)}`).toBeGreaterThan(1);
});

test("Dia-width building state keeps identity clear and the sealed lens quiet", async ({ page }) => {
  await page.setViewportSize({ width: 437, height: 844 });
  await installChromeShim(page, { activeDomain: "symphonyai.com" });
  const startedAt = new Date(Date.now() - 30_000).toISOString();
  const events = [{
    id: "e1",
    runId: "r1",
    slug: "symphonyai",
    domain: "symphonyai.com",
    sectionId: null,
    type: "plan.ready",
    message: "Research plan ready",
    metadata: {},
    createdAt: "2026-06-01T00:00:01.000Z"
  }];

  await page.route("**/api/extension/bootstrap?**", async (route) => {
    await fulfillJson(route, {
      domain: "symphonyai.com",
      slug: "symphonyai",
      card: null,
      runs: {
        basics: {
          slug: "symphonyai",
          domain: "symphonyai.com",
          status: "running",
          mode: "basics",
          startedAt,
          events
        },
        analysis: { slug: "symphonyai", domain: "symphonyai.com", status: "idle", mode: "analysis" }
      }
    });
  });
  await page.route("**/api/extension/cards/**", async (route) => {
    await fulfillJson(route, { error: "card not found" }, 404);
  });
  await page.route("**/api/generate?**", async (route) => {
    await fulfillJson(route, {
      slug: "symphonyai",
      domain: "symphonyai.com",
      status: "running",
      mode: "basics",
      startedAt,
      events
    });
  });

  await openSidePanel(page);

  const heading = page.getByRole("heading", { name: "SymphonyAI" });
  const domain = page.getByRole("link", { name: "symphonyai.com" });
  const status = page.locator(".cs-company-status-slot");
  await expect(heading).toBeVisible();
  await expect(status).toContainText("Reading symphonyai.com");

  const geometry = await page.locator(".cs-company-context-main").evaluate((main) => {
    const headingRect = main.querySelector("h1")!.getBoundingClientRect();
    const domainRect = main.querySelector(".cs-company-domain")!.getBoundingClientRect();
    const statusRect = main.querySelector(".cs-company-status-slot")!.getBoundingClientRect();
    return {
      headingFits: (main.querySelector("h1") as HTMLElement).scrollWidth <= (main.querySelector("h1") as HTMLElement).clientWidth + 1,
      statusTop: statusRect.top,
      identityBottom: Math.max(headingRect.bottom, domainRect.bottom)
    };
  });
  expect(geometry.headingFits).toBe(true);
  expect(geometry.statusTop).toBeGreaterThanOrEqual(geometry.identityBottom + 8);
  await expect(page.locator('.cs-panel-stage-scene[data-panel="loading"]')).toHaveCount(0);

  const sealedLens = page.locator(".cs-lens-sealed");
  await expect(sealedLens).toContainText("Investor Lens");
  await expect(sealedLens.getByRole("button")).toHaveCount(0);
  await expect(sealedLens).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(sealedLens).toHaveCSS("border-right-width", "0px");
  const shellHeight = await page.locator(".cs-research-shell").evaluate((shell) => shell.getBoundingClientRect().height);
  expect(shellHeight).toBeGreaterThanOrEqual(844);
  await page.screenshot({ fullPage: true, path: "/private/tmp/cold-start-symphony-dia-width-after.png" });

  await page.setViewportSize({ width: 431, height: 844 });
  await setTheme(page, "dark");

  const darkGeometry = await page.locator(".cs-company-context-main").evaluate((main) => {
    const headingElement = main.querySelector("h1") as HTMLElement;
    const headingRect = headingElement.getBoundingClientRect();
    const domainRect = main.querySelector(".cs-company-domain")!.getBoundingClientRect();
    const statusRect = main.querySelector(".cs-company-status-slot")!.getBoundingClientRect();
    return {
      headingFits: headingElement.scrollWidth <= headingElement.clientWidth + 1,
      statusTop: statusRect.top,
      identityBottom: Math.max(headingRect.bottom, domainRect.bottom),
      documentFits: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
    };
  });
  expect(darkGeometry.headingFits).toBe(true);
  expect(darkGeometry.statusTop).toBeGreaterThanOrEqual(darkGeometry.identityBottom + 8);
  expect(darkGeometry.documentFits).toBe(true);
  await expect(status).toHaveCSS("border-top-style", "solid");
  await expect(status).not.toHaveCSS("border-top-color", "rgb(25, 24, 22)");
  await page.screenshot({ fullPage: true, path: "/private/tmp/cold-start-symphony-dia-width-dark-after.png" });
});

test("progress tree surfaces real research events as substeps", async ({ page }) => {
  await installChromeShim(page, { activeDomain: "cartesia.ai" });
  const startedAt = new Date(Date.now() - 12_000).toISOString();
  const events = [
    { id: "e1", runId: "r1", slug: "cartesia", domain: "cartesia.ai", sectionId: null, type: "plan.ready", message: "Research plan ready", metadata: {}, createdAt: "2026-06-01T00:00:01.000Z" },
    {
      id: "e2",
      runId: "r1",
      slug: "cartesia",
      domain: "cartesia.ai",
      sectionId: null,
      type: "source.found",
      message: "Found 12 accepted sources",
      metadata: {
        acceptedCount: 12,
        sources: [
          { url: "https://cartesia.ai/", domain: "cartesia.ai", title: "Cartesia", sourceType: "company_site", imageUrl: null },
          { url: "https://techcrunch.com/cartesia", domain: "techcrunch.com", title: "Cartesia raises a Series B", sourceType: "news", imageUrl: null }
        ]
      },
      createdAt: "2026-06-01T00:00:03.000Z"
    },
    { id: "e3", runId: "r1", slug: "cartesia", domain: "cartesia.ai", sectionId: null, type: "card.partial", message: "Saved first usable company card", metadata: { citationCount: 7 }, createdAt: "2026-06-01T00:00:05.000Z" },
    { id: "e4", runId: "r1", slug: "cartesia", domain: "cartesia.ai", sectionId: null, type: "contacts.started", message: "Started async contact enrichment", metadata: {}, createdAt: "2026-06-01T00:00:06.000Z" }
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

  await openSidePanel(page);

  // Events advance the whisper and seal without opening the tree...
  await expect(page.locator(".cs-assembly-whisper")).toContainText("12 sources, building profile");
  await expect(page.locator(".cs-seal-inst")).toHaveAttribute("data-level", "3");
  // ...clippings file what research found, ahead of any card fact...
  await expect(page.locator(".cs-clipping")).toHaveCount(2);
  // ...and the tree behind Details carries the substeps.
  await page.locator(".cs-assembly-details-toggle").click();
  const tree = page.locator(".cs-build-tree");
  await expect(tree).toBeVisible({ timeout: 10_000 });
  await expect(tree).not.toContainText("Picked a research plan");
  await expect(tree).toContainText("12 sources found");
  await expect(tree).toContainText("First cited profile ready · 7 citations");
  await expect(tree).not.toContainText("Started async contact enrichment");
  await expect(page.locator(".cs-build-substeps li").filter({ hasText: "First cited profile ready" })).toHaveCount(0);
});

test("building phase files the early read inline under the header", async ({ page }) => {
  await installChromeShim(page, { activeDomain: "cartesia.ai" });
  const startedAt = new Date(Date.now() - 18_000).toISOString();
  const firstPayoff = {
    status: "substantive_first_read",
    slug: "cartesia",
    domain: "cartesia.ai",
    generatedAt: new Date().toISOString(),
    generatedAtMs: Date.now(),
    entityConfidence: "high",
    entityConfidenceReason: "Company-controlled source matches the current domain.",
    evidenceSoFar: [
      {
        sourceId: "company_site-cartesia.ai",
        url: "https://cartesia.ai/",
        domain: "cartesia.ai",
        title: "Cartesia",
        sourceClass: "company_site",
        quality: "company",
        arrivedAtMs: Date.now(),
        entityMatched: true
      },
      {
        sourceId: "news-techcrunch.com",
        url: "https://techcrunch.com/cartesia",
        domain: "techcrunch.com",
        title: "Cartesia raises funding",
        sourceClass: "funding",
        quality: "reported",
        arrivedAtMs: Date.now(),
        entityMatched: true
      }
    ],
    stillChecking: { text: "Named customer proof.", missingEvidenceClass: "customer_proof" },
    whatItDoes: {
      text: "Cartesia builds real-time voice models for on-device agents.",
      supportingText: "Cartesia builds real-time voice models for on-device agents.",
      sourceIds: ["company_site-cartesia.ai"],
      citationIds: [],
      sourceClass: "company_site",
      claimKind: "what_it_does"
    },
    suppressionReasons: []
  };
  const events = [
    { id: "e1", runId: "r1", slug: "cartesia", domain: "cartesia.ai", sectionId: null, type: "source.found", message: "Found 9 accepted sources", metadata: { acceptedCount: 9 }, createdAt: "2026-06-01T00:00:02.000Z" },
    { id: "e2", runId: "r1", slug: "cartesia", domain: "cartesia.ai", sectionId: null, type: "first_payoff.ready", message: "Early read ready", metadata: { firstPayoff }, createdAt: "2026-06-01T00:00:04.000Z" }
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

  await openSidePanel(page);

  // The read is inline and always open: claim, kicker, and source dots with no reveal step,
  // sitting between the persistent header and the details toggle.
  const read = page.getByLabel("Early read");
  await expect(read).toBeVisible();
  await expect(read).toContainText("What it does");
  await expect(read).toContainText("Cartesia builds real-time voice models for on-device agents.");
  await expect(read.getByLabel("Sources")).toContainText("techcrunch.com");
  await expect(read.locator("button")).toHaveCount(0);
  const headerBox = await page.locator(".cs-company-context").boundingBox();
  const readBox = await read.boundingBox();
  const detailsBox = await page.locator(".cs-assembly-details").boundingBox();
  expect(headerBox?.y).toBeLessThan(readBox?.y ?? 0);
  expect(readBox?.y).toBeLessThan(detailsBox?.y ?? 0);
  await page.waitForTimeout(300);
  await page.screenshot({ fullPage: true, path: "/private/tmp/cold-start-building-early-read.png" });
});

test("reduced motion keeps progress readable without sweeping motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
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

  await openSidePanel(page);

  await expect(page.locator(".cs-build-bar")).toHaveCount(0);
  // The seal and whisper stay legible under reduced motion and hold at the opening level.
  const seal = page.locator(".cs-seal-inst");
  await expect(seal).toHaveAttribute("data-level", "0");
  await expect(seal).toHaveAttribute("data-filed", "false");
  await expect(page.locator(".cs-assembly-whisper")).toContainText("Queued");
  await page.locator(".cs-assembly-details-toggle").click();
  await expect(page.locator(".cs-build-tree")).toBeVisible();
  const drizzlePixel = page.locator(".cs-drizzle-loader span").first();
  // Reduced motion is a reduction, not a freeze: the loader breathes in place
  // instead of stepping spatially.
  await expect(drizzlePixel).toHaveCSS("animation-name", "cs-reduced-breathe");
  await expect(page.locator(".cs-plan-status[data-status='running']").first()).toBeVisible();
});

test("reduced motion keeps the research stack legible and still", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installChromeShim(page);
  await mockExtensionApi(page, browserbaseCardWithSynthesis());
  await openSidePanel(page);

  const stack = page.getByLabel("Research card stack");
  const topCard = page.locator(".cs-dormant-card").first();
  await expect(stack).toBeVisible();
  await expect(topCard).toBeVisible();
  await expect(topCard).toHaveCSS("animation-name", "none");
  await expect(page.locator(".cs-dormant-card-frame").first()).toHaveCSS("animation-name", "none");
  await page.screenshot({ fullPage: true, path: "/private/tmp/cold-start-reduced-motion-rest.png" });
});

test("dragging a dormant card opens a real insertion slot before release", async ({ page }) => {
  const generationRequests: Array<{ confirmStart?: boolean; domain?: string; mode?: string; sectionId?: string }> = [];
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await installChromeShim(page);
  await mockExtensionApi(page, browserbaseCard());
  page.on("request", (request) => {
    if (request.method() !== "POST" || !request.url().endsWith("/api/generate")) {
      return;
    }
    generationRequests.push(request.postDataJSON() as { confirmStart?: boolean; domain?: string; mode?: string; sectionId?: string });
  });
  await openSidePanel(page);

  const card = page.locator(".cs-dormant-card", { hasText: "Who pays" });
  await expect(card).toBeVisible();

  const box = await card.boundingBox();
  expect(box).not.toBeNull();
  if (!box) {
    return;
  }

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 48, { steps: 8 });
  const insertionSlot = page.locator(".cs-module-insertion-slot");
  await expect(insertionSlot).toBeVisible();
  await expect(insertionSlot).toContainText("File Who pays");
  await expect(insertionSlot).toHaveAttribute("data-ready", "false");
  await expect(page.locator(".cs-drop-zone")).toHaveCount(0);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 232, { steps: 12 });
  await expect(insertionSlot).toHaveAttribute("data-ready", "true");
  await page.mouse.up();

  const activeCard = page.locator(".cs-active-enrichment", { hasText: "Who pays" });
  await expect(activeCard).toBeVisible();
  // Filing an already-sourced card layer just opens its own saved content; it queues no
  // section run and does not reach for the Lens.
  expect(generationRequests).toHaveLength(0);
  // The global Lens control, unaffected by which card was filed, runs one full analysis
  // with no sectionId.
  await page.getByRole("button", { name: "Run Investor Lens" }).click();
  await expect.poll(() => generationRequests).toMatchObject([
    { confirmStart: true, domain: "browserbase.com", mode: "analysis" }
  ]);
  expect(generationRequests[0]?.sectionId).toBeUndefined();
});

test("dormant card drag stays attached across pile depth", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await installChromeShim(page);
  await mockExtensionApi(page, browserbaseCardWithSynthesis());
  await openSidePanel(page);

  // The middle scenario runs first on purpose: the very first drag of a fresh page pays a
  // one-time animation warm-up cost that the shallow scenario's tight budget cannot absorb,
  // regardless of which card sits there. A scenario with more slack goes first so the timing
  // guard below is testing real pointer detachment, not cold-start jank.
  for (const scenario of [
    {
      deltas: [
        { label: "initial", y: -24 },
        { label: "mid", y: -96 },
        { label: "ready", y: -180 }
      ],
      label: "Proof",
      slug: "middle"
    },
    {
      deltas: [
        { label: "initial", y: -12 },
        { label: "mid", y: -42 },
        { label: "ready", y: -116 }
      ],
      label: "Who pays",
      slug: "first"
    },
    {
      deltas: [
        { label: "initial", y: -32 },
        { label: "mid", y: -140 },
        { label: "ready", y: -248 }
      ],
      label: "Product",
      slug: "last"
    }
  ] as const) {
    const card = page.locator(".cs-dormant-card", { hasText: scenario.label });
    await card.scrollIntoViewIfNeeded();
    await expect(card).toBeVisible();

    const samples = await dragWithSamples({
      card,
      deltas: scenario.deltas,
      page,
      screenshotPrefix: `cold-start-drag-${scenario.slug}`
    });
    // Pickup intentionally straightens the card to a neutral position, absorbing its resting
    // pile-depth offset (up to ~5px for deep cards) on top of the drag activation distance.
    // The budget allows that designed lift while still failing on real pointer detachment.
    expectPointerAttached(samples, 9);
    await page.mouse.up();
    await expect(page.locator(".cs-active-enrichment", { hasText: scenario.label })).toBeVisible();
    await expect(page.locator(".cs-dormant-card", { hasText: scenario.label })).toHaveCount(0);
  }
});

test("short dormant-card drag settles without click activation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await installChromeShim(page);
  await mockExtensionApi(page, browserbaseCardWithSynthesis());
  await openSidePanel(page);

  const card = page.locator(".cs-dormant-card", { hasText: "Who pays" });
  await expect(card).toBeVisible();

  const box = await card.boundingBox();
  expect(box).not.toBeNull();
  if (!box) {
    return;
  }

  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX, startY - 24, { steps: 8 });
  await page.mouse.up();

  await expect(page.locator(".cs-module-insertion-slot")).toHaveCount(0);
  await expect(page.locator(".cs-dormant-card", { hasText: "Who pays" })).toBeVisible();
  await expect(page.locator(".cs-active-enrichment", { hasText: "Who pays" })).toHaveCount(0);
});

test("active research cards keep one module open at a time", async ({ page }) => {
  const emptySignalsCard = browserbaseCard({ signals: [] });
  await installChromeShim(page);
  await mockExtensionApi(page, emptySignalsCard);
  await page.route("**/api/generate?**", async (route) => {
    await fulfillJson(route, {
      slug: "browserbase",
      domain: "browserbase.com",
      status: "running",
      mode: "basics",
      startedAt: new Date(Date.now() - 14_000).toISOString()
    });
  });
  await openSidePanel(page);

  const dormantSignals = page.locator(".cs-dormant-card", { hasText: "Signals" });
  await dormantSignals.focus();
  await page.keyboard.press("Enter");

  const activeSignals = page.locator('.cs-active-enrichment[data-layer-id="signals"]');
  const signalsHeader = activeSignals.locator(".cs-active-enrichment-head");
  const signalsBody = activeSignals.locator(".cs-active-enrichment-body-frame");
  await expect(activeSignals).toHaveAttribute("data-state", "running");
  await expect(activeSignals).toHaveAttribute("data-expanded", "true");
  await expect(signalsHeader).toHaveAttribute("aria-expanded", "true");
  await expect(activeSignals).toContainText("Refreshing");
  await expect(activeSignals).toContainText("Checking recent traction");
  await expect(activeSignals.locator(".cs-layer-running-sheen")).toHaveCSS("animation-name", "cs-layer-sheen-slide");
  await expect(activeSignals.locator(".cs-layer-running-sheen")).not.toHaveCSS("background-image", "none");
  // Running text itself is solid and readable, not a clipped gradient.
  await expect(activeSignals.locator(".cs-layer-running-text")).toHaveCSS("background-image", "none");

  await signalsHeader.click();

  await expect(activeSignals).toHaveAttribute("data-expanded", "true");
  await expect(signalsHeader).toHaveAttribute("aria-expanded", "true");
  await expect(signalsBody).toHaveAttribute("data-expanded", "true");

  const dormantServes = page.locator(".cs-dormant-card", { hasText: "Who pays" });
  await dormantServes.click();
  const activeServes = page.locator('.cs-active-enrichment[data-layer-id="serves"]');
  await expect(activeServes).toHaveAttribute("data-expanded", "true");
  await expect(activeSignals).toHaveAttribute("data-expanded", "false");
  await expect(page.locator(".cs-dormant-card", { hasText: "Who pays" })).toHaveCount(0);
  await page.screenshot({ fullPage: true, path: "/private/tmp/cold-start-active-transition.png" });
});

async function openReadyProfileWithActiveBasics(page: Parameters<typeof installChromeShim>[0]) {
  await installChromeShim(page, { activeDomain: "browserbase.com" });
  const startedAt = new Date(Date.now() - 32_000).toISOString();
  const events = [
    { id: "profile-e1", runId: "profile-r1", slug: "browserbase", domain: "browserbase.com", sectionId: null, type: "plan.ready", message: "Research plan ready", metadata: { mode: "basics" }, createdAt: "2026-06-01T00:00:01.000Z" },
    { id: "profile-e2", runId: "profile-r1", slug: "browserbase", domain: "browserbase.com", sectionId: null, type: "source.found", message: "Found 5 accepted sources", metadata: { mode: "basics", acceptedCount: 5 }, createdAt: "2026-06-01T00:00:03.000Z" },
    { id: "profile-e3", runId: "profile-r1", slug: "browserbase", domain: "browserbase.com", sectionId: null, type: "card.partial", message: "Saved first usable company card", metadata: { mode: "basics", citationCount: 4 }, createdAt: "2026-06-01T00:00:05.000Z" },
    { id: "analysis-e1", runId: "analysis-r1", slug: "browserbase", domain: "browserbase.com", sectionId: null, type: "generation.started", message: "Started analysis generation", metadata: { mode: "analysis" }, createdAt: "2026-06-01T00:00:06.000Z" }
  ];
  const sources = [
    {
      id: "source-1",
      url: "https://browserbase.com/",
      title: "Browserbase",
      domain: "browserbase.com",
      sourceType: "company_site",
      fetchedAt: "2026-06-01T00:00:03.000Z",
      snippet: "Browserbase turns browser automation into agent infrastructure."
    }
  ];
  await page.route("**/api/extension/bootstrap?**", async (route) => {
    await fulfillJson(route, {
      domain: "browserbase.com",
      slug: "browserbase",
      card: browserbaseCard(),
      sections: [],
      events,
      sources,
      runs: {
        basics: { slug: "browserbase", domain: "browserbase.com", mode: "basics", status: "running", startedAt, events },
        analysis: { slug: "browserbase", domain: "browserbase.com", mode: "analysis", status: "idle" }
      }
    });
  });
  await page.route("**/api/extension/cards/**", async (route) => {
    await fulfillJson(route, browserbaseCard());
  });
  // Keep basics running after card.partial to prove readiness no longer waits for final enrichment.
  await page.route("**/api/generate?**", async (route) => {
    await fulfillJson(route, {
      slug: "browserbase",
      domain: "browserbase.com",
      status: "running",
      mode: "basics",
      startedAt,
      events
    });
  });
  await page.goto("/sidepanel.html");
}

test("card.partial keeps the research stack usable while basics finalizes", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await openReadyProfileWithActiveBasics(page);

  await expect(page.getByRole("heading", { name: "Browserbase" })).toBeVisible();
  // The profile-phase progress banner is dissolved; the filed stamp and per-module status
  // carry this state instead.
  await expect(page.locator(".cs-research-progress")).toHaveCount(0);
  const stamp = page.getByLabel("Sources checked");
  await expect(stamp).toBeVisible();
  await expect(stamp).toContainText("source");
  await expect(page.getByText("Filling in contacts and details")).toHaveCount(0);
  await expect(page.locator(".cs-active-enrichment[data-state='running']")).toHaveCount(0);
  await expect(page.getByText("Getting the profile ready")).toHaveCount(0);
  await expect(page.getByText("Finishing profile")).toHaveCount(0);
  await expect(page.locator(".cs-card-tray-head")).toContainText("waiting");
  await expect(page.locator(".cs-dormant-card", { hasText: "Who pays" })).toBeVisible();
  await page.screenshot({ fullPage: true, path: "/private/tmp/cold-start-starter-profile-ready.png" });
});

test("starter profile readiness does not show profile-finishing motion under reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openReadyProfileWithActiveBasics(page);

  await expect(page.locator(".cs-active-enrichment[data-state='running']")).toHaveCount(0);
  await expect(page.locator(".cs-layer-running-sheen")).toHaveCount(0);
  await expect(page.getByText("Getting the profile ready")).toHaveCount(0);
});

test("keyboard activation runs the investor lens", async ({ page }) => {
  const generationRequests: Array<{ confirmStart?: boolean; domain?: string; mode?: string; sectionId?: string }> = [];
  await installChromeShim(page);
  await mockExtensionApi(page, browserbaseCard());
  page.on("request", (request) => {
    if (request.method() !== "POST" || !request.url().endsWith("/api/generate")) {
      return;
    }
    generationRequests.push(request.postDataJSON() as { confirmStart?: boolean; domain?: string; mode?: string; sectionId?: string });
  });
  await openSidePanel(page);

  // The Lens control sits above the card tray regardless of which research cards are filed,
  // so keyboard activation targets it directly rather than a dormant card.
  const lensButton = page.getByRole("button", { name: "Run Investor Lens" });
  await lensButton.focus();
  expect(generationRequests).toHaveLength(0);
  await page.keyboard.press("Enter");

  // The lens slot swaps to the watchable wait while the one analysis run works.
  await expect(page.locator(".cs-wait")).toBeVisible();
  await expect(page.locator(".cs-wait")).toContainText("Investor Lens running");
  await page.locator(".cs-lens-slot").screenshot({ path: "/private/tmp/cold-start-lens-running.png" });
  await expect.poll(() => generationRequests).toMatchObject([
    { confirmStart: true, domain: "browserbase.com", mode: "analysis" }
  ]);
  expect(generationRequests[0]?.sectionId).toBeUndefined();
});


test("person dossier docks below the people block while the description tooltip still floats beside its trigger", async ({ page }) => {
  await installChromeShim(page);
  await mockExtensionApi(page, browserbaseCardWithPeople());
  await openSidePanel(page);

  const people = page.getByLabel("Management team");
  const person = page.locator(".cs-people-person").first();
  await person.hover();
  const tooltip = page.locator(".cs-shared-tooltip");
  await expect(tooltip).toBeVisible();
  // The person tooltip is the structured dossier variant: role plus whatever earns its
  // place (read, provenance, channels), not a plain string body.
  await expect(tooltip).toHaveAttribute("data-variant", "dossier");
  await expect(tooltip.locator(".cs-dossier-role")).toContainText("Co-founder & CEO");
  await expect(tooltip.locator(".cs-dossier-provenance")).toBeVisible();
  // The tooltip is a fixed overlay; the arc shell's positioned-child rule must not capture it.
  await expect(tooltip).toHaveCSS("position", "fixed");

  // Docked contract (Task 4.1): this test used to assert the dossier floated in a narrow
  // column just above whichever row triggered it (the occlusion bug's own geometry). It now
  // always docks below the entire people block at a fixed, full-width-minus-margins region.
  // Hovering the FIRST row -- the case an "above" placement would have had the most room to
  // render safely under the old code -- still must dock, not float beside the row.
  await expect(tooltip).toHaveAttribute("data-mode", "docked");
  const peopleBox = await people.boundingBox();
  const dockedBox = await tooltip.boundingBox();
  if (!peopleBox || !dockedBox) {
    throw new Error("Expected bounding boxes for the people block and its docked dossier");
  }
  expect(dockedBox.y).toBeGreaterThan(peopleBox.y + peopleBox.height - 2);
  const viewportWidth = page.viewportSize()?.width ?? 0;
  expect(dockedBox.width).toBeGreaterThan(viewportWidth - 40);

  // The description "(more)" tooltip stays in popover mode: it still floats in a narrow
  // column right beside the affordance that opened it, unaffected by the person dossier's
  // move to docked mode.
  const more = page.getByRole("button", { name: "Read the full company description" });
  await more.hover();
  await expect(tooltip).toContainText("hosted browser runtime");
  await expect(tooltip).toHaveAttribute("data-mode", "popover");
  // The tooltip animates between triggers, so poll until it settles under the affordance.
  await expect.poll(async () => {
    const moreBox = await more.boundingBox();
    const belowBox = await tooltip.boundingBox();
    if (!moreBox || !belowBox) {
      return Number.NaN;
    }
    return belowBox.y - (moreBox.y + moreBox.height);
  }).toBeLessThan(48);
});

test("the plain description tooltip persists across the trigger-to-tooltip gap like the dossier", async ({ page }) => {
  await installChromeShim(page);
  await mockExtensionApi(page, browserbaseCardWithPeople());
  await openSidePanel(page);

  const more = page.getByRole("button", { name: "Read the full company description" });
  await more.hover();
  const tooltip = page.locator(".cs-shared-tooltip");
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveAttribute("data-variant", "text");

  // The pointer bridges the gap onto the tooltip body itself; a reachable hovercard must
  // not vanish while the pointer is mid-transit or resting on the tooltip.
  await tooltip.hover();
  await page.waitForTimeout(250);
  await expect(tooltip).toBeVisible();

  // Moving away from both the trigger and the tooltip closes it after the grace window.
  await page.mouse.move(5, 5);
  await expect(tooltip).toHaveCount(0);
});

test("the dossier sizes to a long read without clipping its bottom rows", async ({ page }) => {
  const card = browserbaseCardWithPeople();
  const founders = card.team.founders.value ?? [];
  const paul = founders[0];
  if (paul) {
    founders[0] = {
      ...paul,
      githubUrl: "https://github.com/paulklein",
      xUrl: "https://x.com/paulklein",
      personalUrl: "https://paulklein.dev",
      read: {
        text: "Second infrastructure company after his first browser automation startup was acquired, and he has led every major Browserbase release from a fully remote engineering team. His first company sold to a data platform after three years of steady, unglamorous revenue growth.",
        citationIds: ["c2", "c3"]
      }
    };
  }

  await installChromeShim(page);
  await mockExtensionApi(page, card);
  await openSidePanel(page);

  const person = page.locator(".cs-people-person", { hasText: "Paul Klein" });
  await person.hover();
  const tooltip = page.locator(".cs-shared-tooltip");
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveAttribute("data-variant", "dossier");
  await expect(tooltip.locator(".cs-dossier-read")).toContainText("Second infrastructure company");
  await expect(tooltip.locator(".cs-dossier-provenance")).toBeVisible();
  await expect(tooltip.locator(".cs-dossier-email")).toBeVisible();
  await expect(tooltip.locator(".cs-dossier-channel")).toHaveCount(3);

  // With ample viewport room (the 900px-tall test panel), the dossier sizes itself to its
  // content instead of clipping the bottom rows at a fixed cap: no scrollable overflow.
  const overflow = await tooltip.evaluate((element) => element.scrollHeight - element.clientHeight);
  expect(overflow).toBeLessThanOrEqual(1);

  await tooltip.screenshot({ path: "/private/tmp/cold-start-dossier-long-read.png" });
});

// Task 4.3 red-first regression: the pre-Task-4.1 tooltip floated above whichever row opened
// it and could grow tall enough to cover the rows above it. When that happened, the pointer's
// move onto an earlier row's real screen position instead landed on the occluding tooltip (the
// browser's own hit test resolves to whatever paints on top), so the earlier row's own dossier
// never opened -- the tooltip just kept showing the row that opened it. Task 4.1's docked mode
// fixes this by always rendering the dossier below the entire people block, so it can never sit
// on top of any row. Danielle Cordova (row 3) is given a maximal dossier (read, inferred email,
// three channels) so the old floating card is tall enough to guarantee the overlap; this is not
// a hypothetical, it is the exact geometry that made the bug real.
test("moving from person row 3 to row 1 opens row 1's dossier, not a stale occluding card", async ({ page }) => {
  const card = browserbaseCardWithPeople();
  const keyExecs = card.team.keyExecs.value ?? [];
  const danielle = keyExecs[0];
  if (danielle) {
    keyExecs[0] = {
      ...danielle,
      email: "danielle.cordova@browserbase.com",
      emailStatus: "inferred",
      emailBasis: "domain pattern first.last, 4 observed addresses",
      githubUrl: "https://github.com/dcordova",
      xUrl: "https://x.com/dcordova",
      personalUrl: "https://danielle.dev",
      read: {
        text: "Led every browser-runtime release from a fully remote engineering team after joining from a distributed systems background at a prior infrastructure startup that shipped a similar managed-session product.",
        citationIds: ["c1"]
      }
    };
  }

  await installChromeShim(page);
  await mockExtensionApi(page, card);
  await openSidePanel(page);

  const rows = page.locator(".cs-people-person");
  await expect(rows).toHaveCount(4);
  const row1 = rows.nth(0);
  const row3 = rows.nth(2);
  await expect(row3).toContainText("Danielle Cordova");
  await expect(row1).toContainText("Paul Klein");

  const row3Box = await row3.boundingBox();
  if (!row3Box) {
    throw new Error("Expected a bounding box for person row 3");
  }
  await page.mouse.move(row3Box.x + row3Box.width / 2, row3Box.y + row3Box.height / 2);

  const tooltip = page.locator(".cs-shared-tooltip");
  await expect(tooltip).toContainText("Danielle Cordova", { timeout: 500 });

  const row1Box = await row1.boundingBox();
  if (!row1Box) {
    throw new Error("Expected a bounding box for person row 1");
  }
  const moveStartedAt = Date.now();
  await page.mouse.move(row1Box.x + row1Box.width / 2, row1Box.y + row1Box.height / 2);

  await expect(tooltip).toContainText("Paul Klein", { timeout: 500 });
  expect(Date.now() - moveStartedAt).toBeLessThan(500);
});

test("the docked person dossier never overlaps any person row's own bounding box", async ({ page }) => {
  await installChromeShim(page);
  await mockExtensionApi(page, browserbaseCardWithPeople());
  await openSidePanel(page);

  const rows = page.locator(".cs-people-person");
  await expect(rows).toHaveCount(4);
  const rowBoxes = [];
  for (let index = 0; index < 4; index += 1) {
    const box = await rows.nth(index).boundingBox();
    if (!box) {
      throw new Error(`Expected a bounding box for person row ${index}`);
    }
    rowBoxes.push(box);
  }

  // Every trigger, not just a lucky one: the dock never moves, but this proves the contract
  // holds for the row nearest the dock (row 4) and every row further from it (rows 1-3),
  // where the pre-4.1 "grows upward" bug had the most room to cover an earlier row.
  for (let index = 0; index < 4; index += 1) {
    await rows.nth(index).hover();
    const tooltip = page.locator(".cs-shared-tooltip");
    await expect(tooltip).toBeVisible();
    const tooltipBox = await tooltip.boundingBox();
    if (!tooltipBox) {
      throw new Error(`Expected a bounding box for the dossier opened from row ${index}`);
    }
    for (const [rowIndex, rowBox] of rowBoxes.entries()) {
      const intersects =
        tooltipBox.x < rowBox.x + rowBox.width &&
        tooltipBox.x + tooltipBox.width > rowBox.x &&
        tooltipBox.y < rowBox.y + rowBox.height &&
        tooltipBox.y + tooltipBox.height > rowBox.y;
      expect(
        intersects,
        `dossier opened from row ${index} must not intersect row ${rowIndex}'s box ` +
          `(dossier ${JSON.stringify(tooltipBox)}, row ${JSON.stringify(rowBox)})`
      ).toBe(false);
    }
    await page.mouse.move(5, 5);
    await expect(tooltip).toHaveCount(0);
  }
});

// The sweep above only ever exercises the hover (unpinned, clamped-to-3-lines) dossier. A
// pinned dossier with a long read grows taller (the clamp lifts, see company-arc.css's
// .cs-dossier[data-pinned="true"] .cs-dossier-read), so the non-intersection contract needs
// its own pass at that larger size, plus the dock must stay inside the viewport rather than
// grow past its bottom edge.
test("the pinned, expanded person dossier still never overlaps any row and stays within the viewport", async ({ page }) => {
  const card = browserbaseCardWithPeople();
  const founders = card.team.founders.value ?? [];
  const paul = founders[0];
  if (paul) {
    founders[0] = {
      ...paul,
      read: {
        text: "Second infrastructure company after his first browser automation startup was acquired, and he has led every major Browserbase release from a fully remote engineering team. His first company sold to a data platform after three years of steady, unglamorous revenue growth.",
        citationIds: ["c2", "c3"]
      }
    };
  }

  await installChromeShim(page);
  await mockExtensionApi(page, card);
  await openSidePanel(page);

  const rows = page.locator(".cs-people-person");
  await expect(rows).toHaveCount(4);
  const rowBoxes = [];
  for (let index = 0; index < 4; index += 1) {
    const box = await rows.nth(index).boundingBox();
    if (!box) {
      throw new Error(`Expected a bounding box for person row ${index}`);
    }
    rowBoxes.push(box);
  }

  await rows.first().click();
  const tooltip = page.locator(".cs-shared-tooltip");
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveAttribute("data-pinned", "true");
  const dossierRead = tooltip.locator(".cs-dossier-read");
  await expect(dossierRead).toContainText("Second infrastructure company");
  // The pin lifts the 3-line clamp (expand-on-pin, company-arc.css); confirm the read actually
  // unclamped rather than just trusting the pinned attribute.
  await expect(dossierRead).toHaveCSS("overflow", "visible");

  const tooltipBox = await tooltip.boundingBox();
  if (!tooltipBox) {
    throw new Error("Expected a bounding box for the pinned dossier");
  }
  for (const [rowIndex, rowBox] of rowBoxes.entries()) {
    const intersects =
      tooltipBox.x < rowBox.x + rowBox.width &&
      tooltipBox.x + tooltipBox.width > rowBox.x &&
      tooltipBox.y < rowBox.y + rowBox.height &&
      tooltipBox.y + tooltipBox.height > rowBox.y;
    expect(
      intersects,
      `pinned dossier must not intersect row ${rowIndex}'s box ` +
        `(dossier ${JSON.stringify(tooltipBox)}, row ${JSON.stringify(rowBox)})`
    ).toBe(false);
  }

  // Scrolls its own overflow (maxHeight from useSharedTooltip's dockedGeometry) instead of
  // growing past the bottom edge of the viewport.
  const viewportHeight = page.viewportSize()?.height ?? 0;
  expect(tooltipBox.y + tooltipBox.height).toBeLessThanOrEqual(viewportHeight);
});

test("a fast pointer fly-by across all person rows opens nothing", async ({ page }) => {
  await installChromeShim(page);
  await mockExtensionApi(page, browserbaseCardWithPeople());
  await openSidePanel(page);

  const rows = page.locator(".cs-people-person");
  await expect(rows).toHaveCount(4);
  const points: Array<{ x: number; y: number }> = [];
  for (let index = 0; index < 4; index += 1) {
    const box = await rows.nth(index).boundingBox();
    if (!box) {
      throw new Error(`Expected a bounding box for person row ${index}`);
    }
    points.push({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
  }

  const flyByStartedAt = Date.now();
  for (const point of points) {
    await page.mouse.move(point.x, point.y);
  }
  const flyByElapsed = Date.now() - flyByStartedAt;
  expect(flyByElapsed, "the fly-by traversal must stay under the 90ms open-intent gate for this assertion to prove anything").toBeLessThan(80);

  // The 90ms open-intent gate (OPEN_INTENT_MS in SharedTooltip.tsx) means a pointer that never
  // dwells on a row long enough opens nothing: every row's pointerenter timer got cleared by
  // the next row's pointerleave before it could fire.
  await page.waitForTimeout(50);
  await expect(page.locator(".cs-shared-tooltip")).toHaveCount(0);

  // Proves the gate, not a broken hover: given real dwell time on the last row, the same
  // pointer position does open its dossier.
  await page.waitForTimeout(80);
  await expect(page.locator(".cs-shared-tooltip")).toContainText("Marcus Webb");
});

test("the docked dossier opens with no transition under reduced motion and still retargets on hover", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installChromeShim(page);
  await mockExtensionApi(page, browserbaseCardWithPeople());
  await openSidePanel(page);

  const rows = page.locator(".cs-people-person");
  await rows.first().hover();
  const tooltip = page.locator(".cs-shared-tooltip");
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveAttribute("data-mode", "docked");
  await expect(tooltip).toHaveAttribute("data-animate", "false");
  await expect(tooltip).toContainText("Paul Klein");

  // Still functional: retargeting to a sibling row under reduced motion still swaps the
  // dossier's content (the hot-retarget path is a timing rule, not motion, so it is
  // unaffected by prefers-reduced-motion), it just never animates the swap.
  await rows.nth(1).hover();
  await expect(tooltip).toContainText("Nat Miletic");
  await expect(tooltip).toHaveAttribute("data-animate", "false");
});

test("the +N people chip is pressable and its hover tooltip lists the hidden names and roles", async ({ page }) => {
  const card = browserbaseCard({
    team: {
      founders: {
        value: [
          { name: "Ada Lovelace", role: "CEO", sourceUrl: "https://acme.ai/a", email: "ada@acme.ai", emailStatus: "observed" },
          { name: "Grace Hopper", role: "CTO", sourceUrl: "https://acme.ai/b" },
          { name: "Katherine Johnson", role: "Head of Research", sourceUrl: "https://acme.ai/c" },
          { name: "Dorothy Vaughan", role: "Engineering lead", sourceUrl: "https://acme.ai/d" },
          { name: "Mary Jackson", role: "Design lead", sourceUrl: "https://acme.ai/e" },
          { name: "Annie Easley", role: "Advisor", sourceUrl: "https://acme.ai/f" }
        ],
        status: "verified",
        confidence: "medium",
        citationIds: ["c1"]
      },
      keyExecs: { value: [], status: "unknown", confidence: "low", citationIds: [] },
      headcount: { value: null, status: "unknown", confidence: "low", citationIds: [] }
    }
  });

  await installChromeShim(page);
  await mockExtensionApi(page, card);
  await openSidePanel(page);

  // Primary rows only: the 2 overflow rows are already mounted inside the measured-height
  // frame (never conditionally rendered), just visually collapsed until the chip expands them.
  await expect(page.locator(".cs-people-line-list > .cs-people-person")).toHaveCount(4);
  const chip = page.locator(".cs-people-more");
  await expect(chip).toBeVisible();
  await expect(chip).toHaveText("+2 more");
  await expect(chip).toHaveAttribute("aria-expanded", "false");

  // The resting affordance is a seal-tinted pill, not the old flat gray fill that read as
  // dead UI: rgb(110 92 158 / ...) shows up in both the border and the fill.
  const restingBorder = await chip.evaluate((element) => getComputedStyle(element).borderColor);
  const restingBackground = await chip.evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(restingBorder).toMatch(/110,\s*92,\s*158/);
  expect(restingBackground).toMatch(/110,\s*92,\s*158/);

  await chip.hover();
  const tooltip = page.locator(".cs-shared-tooltip");
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveAttribute("data-variant", "text");
  await expect(tooltip).toContainText("Mary Jackson, Design lead");
  await expect(tooltip).toContainText("Annie Easley, Advisor");

  // Clicking still expands the row; the tooltip affordance and the click coexist.
  await chip.click();
  await expect(page.locator(".cs-people-person")).toHaveCount(6);
  await expect(chip).toHaveAttribute("aria-expanded", "true");
  await expect(chip).toHaveText("Show fewer");
});

// jsdom cannot compute CSS visibility, so the "collapsed rows are unreachable" contract can
// only be proven with a real browser: grid-template-rows: 0fr and opacity: 0 alone still leave
// an element in the tab order, so a keyboard user tabbing past the visible four used to land on
// a 0-height, invisible row whose onFocus opened its dossier anyway (the blocking regression
// signals.css's .cs-people-overflow-frame now fixes with visibility: hidden). This proves the
// fix both ways: unreachable while collapsed, reachable and dossier-opening once expanded.
test("collapsed overflow person rows are unreachable by keyboard and open no dossier until expanded", async ({ page }) => {
  const card = browserbaseCard({
    team: {
      founders: {
        value: [
          { name: "Ada Lovelace", role: "CEO", sourceUrl: "https://acme.ai/a", email: "ada@acme.ai", emailStatus: "observed" },
          { name: "Grace Hopper", role: "CTO", sourceUrl: "https://acme.ai/b" },
          { name: "Katherine Johnson", role: "Head of Research", sourceUrl: "https://acme.ai/c" },
          { name: "Dorothy Vaughan", role: "Engineering lead", sourceUrl: "https://acme.ai/d" },
          { name: "Mary Jackson", role: "Design lead", sourceUrl: "https://acme.ai/e" },
          { name: "Annie Easley", role: "Advisor", sourceUrl: "https://acme.ai/f" }
        ],
        status: "verified",
        confidence: "medium",
        citationIds: ["c1"]
      },
      keyExecs: { value: [], status: "unknown", confidence: "low", citationIds: [] },
      headcount: { value: null, status: "unknown", confidence: "low", citationIds: [] }
    }
  });

  await installChromeShim(page);
  await mockExtensionApi(page, card);
  await openSidePanel(page);

  // .cs-people-person matches all 6 rows -- the 2 overflow rows stay mounted, just collapsed
  // (the whole point of this test). Only the direct children of the primary list are the 4
  // visible rows; the overflow pair lives nested inside .cs-people-overflow-frame instead.
  const rows = page.locator(".cs-people-person");
  const primaryRows = page.locator(".cs-people-line-list > .cs-people-person");
  await expect(rows).toHaveCount(6);
  await expect(primaryRows).toHaveCount(4);
  const chip = page.locator(".cs-people-more");
  await expect(chip).toHaveAttribute("aria-expanded", "false");
  const tooltip = page.locator(".cs-shared-tooltip");
  const overflowNames = ["Mary Jackson", "Annie Easley"];

  async function focusedRowSnapshot() {
    return page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      if (!element) {
        return null;
      }
      return { className: element.className, text: element.textContent ?? "" };
    });
  }

  // Six DOM stops exist while collapsed: 4 visible rows, 2 invisible overflow rows. Tabbing
  // from the first row 5 times walks: row2, row3, row4, the "+2 more" chip, and one probe past
  // it. If the fix holds, that final stop skips straight over both overflow rows -- accessible
  // names never surface "Mary Jackson" or "Annie Easley" at any point in the walk, and no
  // *dossier* for either of them ever opens along the way. The chip itself legitimately opens
  // a text-variant summary tooltip naming both hidden people on focus (tested elsewhere); that
  // is the intentional accessible preview, not the bug, so only a data-variant="dossier"
  // tooltip naming an overflow person counts as the regression here.
  await rows.first().focus();
  const snapshots = [await focusedRowSnapshot()];
  for (let step = 0; step < 5; step += 1) {
    await page.keyboard.press("Tab");
    snapshots.push(await focusedRowSnapshot());
    if ((await tooltip.count()) && (await tooltip.getAttribute("data-variant")) === "dossier") {
      for (const name of overflowNames) {
        await expect(tooltip, `dossier after tab step ${step} must not surface overflow person ${name}`).not.toContainText(name);
      }
    }
  }

  for (const [index, snapshot] of snapshots.entries()) {
    for (const name of overflowNames) {
      expect(snapshot?.text ?? "", `focus at step ${index} must not land on overflow person ${name}`).not.toContain(name);
    }
  }
  // None of the six focus stops ever matched an overflow row's own element.
  expect(snapshots.some((snapshot) => snapshot?.className.includes("cs-people-person") && overflowNames.some((name) => snapshot.text.includes(name)))).toBe(false);

  // Expand the overflow: the fifth row becomes a real, reachable tab stop and its own focus
  // opens its dossier, proving the toggle re-enables focus in both directions. The overflow
  // frame sits before the chip in DOM order (primary rows, then the overflow frame, then the
  // chip), so the row that becomes reachable is the very next tab stop after the last primary
  // row, not after the chip.
  await chip.click();
  await expect(chip).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".cs-people-overflow-frame")).toHaveAttribute("data-expanded", "true");

  await primaryRows.last().focus();
  await page.keyboard.press("Tab");
  const afterExpand = await focusedRowSnapshot();
  expect(afterExpand?.className).toContain("cs-people-person");
  expect(afterExpand?.text ?? "").toContain("Mary Jackson");
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveAttribute("data-variant", "dossier");
  await expect(tooltip).toContainText("Mary Jackson");
});

test("early read survives the basics generating-to-success handoff", async ({ page }) => {
  await installChromeShim(page, { activeDomain: "browserbase.com" });
  const startedAt = new Date(Date.now() - 6_000).toISOString();
  const claim = "Browserbase runs managed browser sessions for AI agents.";
  const firstPayoff = {
    status: "substantive_first_read",
    slug: "browserbase",
    domain: "browserbase.com",
    generatedAt: new Date().toISOString(),
    generatedAtMs: Date.now(),
    entityConfidence: "high",
    entityConfidenceReason: "Company-controlled source matches the current domain.",
    evidenceSoFar: [
      {
        sourceId: "company_site-browserbase.com",
        url: "https://browserbase.com/",
        domain: "browserbase.com",
        title: "Browserbase",
        sourceClass: "company_site",
        quality: "company",
        arrivedAtMs: Date.now(),
        entityMatched: true
      }
    ],
    stillChecking: { text: "Named customer proof.", missingEvidenceClass: "customer_proof" },
    whatItDoes: {
      text: claim,
      supportingText: claim,
      sourceIds: ["company_site-browserbase.com"],
      citationIds: [],
      sourceClass: "company_site",
      claimKind: "what_it_does"
    },
    suppressionReasons: []
  };
  const events = [
    { id: "e1", runId: "r1", slug: "browserbase", domain: "browserbase.com", sectionId: null, type: "source.found", message: "Found 5 accepted sources", metadata: { mode: "basics", acceptedCount: 5 }, createdAt: "2026-06-01T00:00:02.000Z" },
    { id: "e2", runId: "r1", slug: "browserbase", domain: "browserbase.com", sectionId: null, type: "first_payoff.ready", message: "Early read ready", metadata: { mode: "basics", firstPayoff }, createdAt: "2026-06-01T00:00:04.000Z" }
  ];
  let basicsFinished = false;
  await page.route("**/api/extension/bootstrap?**", async (route) => {
    await fulfillJson(route, {
      domain: "browserbase.com",
      slug: "browserbase",
      card: null,
      events,
      runs: {
        basics: { slug: "browserbase", domain: "browserbase.com", status: "running", mode: "basics", startedAt, events },
        analysis: { slug: "browserbase", domain: "browserbase.com", status: "idle", mode: "analysis" }
      }
    });
  });
  await page.route("**/api/extension/cards/**", async (route) => {
    if (basicsFinished) {
      await fulfillJson(route, browserbaseCard());
      return;
    }
    await fulfillJson(route, { error: "card not found" }, 404);
  });
  await page.route("**/api/generate?**", async (route) => {
    await fulfillJson(route, {
      slug: "browserbase",
      domain: "browserbase.com",
      status: basicsFinished ? "success" : "running",
      mode: "basics",
      startedAt,
      events
    });
  });

  await openSidePanel(page);

  const read = page.getByLabel("Early read");
  await expect(read).toBeVisible();
  await expect(read).toContainText(claim);

  basicsFinished = true;

  // The profile phase mounts the research layer; the same read must ride across the remount.
  await expect(page.getByLabel("Research layer")).toBeVisible({ timeout: 10_000 });
  await expect(read).toBeVisible();
  await expect(read).toContainText(claim);
});

test("timing files the remaining supported fields behind an inline disclosure", async ({ page }) => {
  const card = browserbaseCardWithSynthesis();
  card.synthesis = {
    whyItMatters: {
      text: "Browserbase turns browser automation into agent infrastructure [c1].",
      citationIds: ["c1", "c2"]
    },
    bullCase: [{ text: "Developers need reliable browser sessions for AI workflows [c3].", citationIds: ["c3"] }],
    bearCase: [],
    openQuestions: [{ question: "Can Browserbase defend against cloud providers bundling browser runtimes?", category: "durability" }],
    marketStructureAndTiming: {
      buyerBudget: { text: "Platform teams own the browser-infrastructure budget [c2].", citationIds: ["c2"] },
      painSeverity: null,
      adoptionTrigger: { text: "Agent rollouts are forcing teams to standardize browser infrastructure [c2].", citationIds: ["c2"] },
      marketStructure: null,
      profitPool: null,
      expansionPath: null,
      timingRisk: null
    }
  };
  await installChromeShim(page);
  await mockExtensionApi(page, card);
  await openSidePanel(page);

  const timing = page.getByRole("article", { name: "Investor read" }).locator(".cs-lens-timing");
  await expect(timing).toContainText("Adoption trigger");
  await expect(timing).toContainText("Agent rollouts are forcing teams to standardize browser infrastructure.");

  // The overflow count is an inline disclosure, not a tooltip: clicking expands it in place.
  // The overflow content is always in the DOM (reduced motion must never hide content, only
  // change how the reveal animates), so the closed/open distinction is the frame's own
  // data-expanded flag, not text presence.
  const more = timing.locator(".cs-investor-read-more");
  const frame = timing.locator(".cs-investor-read-disclosure-frame");
  await expect(more).toHaveText("+1 more");
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await expect(frame).toHaveAttribute("data-expanded", "false");

  await more.click();

  await expect(more).toHaveAttribute("aria-expanded", "true");
  await expect(frame).toHaveAttribute("data-expanded", "true");
  await expect(timing).toContainText("Buyer budget. Platform teams own the browser-infrastructure budget.");
  await page.screenshot({ fullPage: true, path: "/private/tmp/cold-start-lens-timing-more.png" });
});

// Task 4.3 call-site sweep, retired site 1 of 3: the case's holds/breaks tension used to
// carry a "+N" tooltip per side (Phase 2). It now files extra verified claims behind the
// same measured-height inline disclosure the timing row already uses.
test("the case files extra holds and breaks claims behind inline disclosure, not a tooltip", async ({ page }) => {
  const card = browserbaseCardWithSynthesis();
  card.synthesis = {
    whyItMatters: {
      text: "Browserbase turns browser automation into agent infrastructure [c1].",
      citationIds: ["c1"]
    },
    bullCase: [
      { text: "Developers need reliable browser sessions for AI workflows [c2].", citationIds: ["c2"] },
      { text: "Enterprise pilots have converted to paid multi-team contracts [c3].", citationIds: ["c3"] }
    ],
    bearCase: [
      { text: "Cloud providers could bundle a comparable managed browser runtime [c1].", citationIds: ["c1"] },
      { text: "Open-source automation frameworks lower the switching cost to self-host [c2].", citationIds: ["c2"] }
    ],
    openQuestions: [{ question: "Can Browserbase defend against cloud providers bundling browser runtimes?", category: "durability" }]
  };
  await installChromeShim(page);
  await mockExtensionApi(page, card);
  await openSidePanel(page);

  const theCase = page.getByRole("article", { name: "Investor read" }).getByLabel("The case");
  const holds = theCase.locator('.cs-lens-tension-side[data-side="holds"]');
  const breaks = theCase.locator('.cs-lens-tension-side[data-side="breaks"]');

  for (const side of [holds, breaks]) {
    const more = side.locator(".cs-investor-read-more");
    const frame = side.locator(".cs-investor-read-disclosure-frame");
    await expect(more).toHaveText("+1 more");
    await expect(more).toHaveAttribute("aria-expanded", "false");
    await expect(frame).toHaveAttribute("data-expanded", "false");

    await more.click();

    await expect(more).toHaveAttribute("aria-expanded", "true");
    await expect(frame).toHaveAttribute("data-expanded", "true");
    // The retired tooltip never mounts: expanding is purely inline, same document flow.
    await expect(page.locator(".cs-shared-tooltip")).toHaveCount(0);
  }

  await expect(holds).toContainText("Enterprise pilots have converted to paid multi-team contracts.");
  await expect(breaks).toContainText("Open-source automation frameworks lower the switching cost to self-host.");
});

// Task 4.3 call-site sweep, retired site 2 of 3: next question's ranked list used to carry
// its own "+N" tooltip (Phase 2). It now files the model's remaining ranked questions behind
// the same inline disclosure pattern.
test("next question files extra ranked questions behind inline disclosure, not a tooltip", async ({ page }) => {
  const card = browserbaseCardWithSynthesis();
  card.synthesis = {
    whyItMatters: { text: "Browserbase turns browser automation into agent infrastructure [c1].", citationIds: ["c1"] },
    bullCase: [{ text: "Developers need reliable browser sessions for AI workflows [c2].", citationIds: ["c2"] }],
    bearCase: [],
    openQuestions: [
      {
        question: "What share of managed sessions convert from a free trial to a paid seat within 60 days?",
        category: "buyer_budget",
        wouldChangeReadIf: "Trial-to-paid conversion holds above 20% for two consecutive quarters."
      },
      {
        question: "How much of the roadmap depends on a single hyperscaler's browser rendering API staying stable?",
        category: "durability"
      },
      {
        question: "What is the gross margin on a managed browser session once proxy and compute costs are included?",
        category: "unit_economics"
      }
    ]
  };
  await installChromeShim(page);
  await mockExtensionApi(page, card);
  await openSidePanel(page);

  const question = page.getByRole("article", { name: "Investor read" }).getByLabel("Next question");
  await expect(question).toContainText("What share of managed sessions convert from a free trial");

  const more = question.locator(".cs-investor-read-more");
  const frame = question.locator(".cs-investor-read-disclosure-frame");
  await expect(more).toHaveText("+2 more");
  await expect(frame).toHaveAttribute("data-expanded", "false");

  await more.click();

  await expect(frame).toHaveAttribute("data-expanded", "true");
  await expect(question).toContainText("How much of the roadmap depends on a single hyperscaler's browser rendering API staying stable?");
  await expect(question).toContainText("What is the gross margin on a managed browser session once proxy and compute costs are included?");
  // The retired tooltip never mounts: expanding is purely inline, same document flow.
  await expect(page.locator(".cs-shared-tooltip")).toHaveCount(0);
});

// Task 4.3 call-site sweep, site 5 of 5 (SharedTooltip's own consumer, not a retired site):
// the lens footer's own "+N also cited" chip is a real SharedTooltip trigger, distinct from
// ResearchLayerPanel's SourceChips overflow chip already covered by the "multi-round Money"
// test above.
test("the lens footer's own '+N also cited' chip is a hover tooltip, not inline disclosure", async ({ page }) => {
  const card = browserbaseCardWithSynthesis();
  card.citations = [
    ...card.citations,
    {
      id: "c4",
      url: "https://venturebeat.com/ai/browserbase-agent-browsers",
      title: "Browserbase expands its agent browser platform",
      fetchedAt: "2026-05-12T12:00:00.000Z",
      sourceType: "news"
    },
    {
      id: "c5",
      url: "https://sec.gov/browserbase-form-d",
      title: "Browserbase Form D filing",
      fetchedAt: "2026-05-12T12:00:00.000Z",
      sourceType: "filing"
    }
  ];
  card.synthesis = {
    whyItMatters: { text: "Browserbase turns browser automation into agent infrastructure [c1].", citationIds: ["c1"] },
    bullCase: [
      { text: "Developers need reliable browser sessions for AI workflows [c2].", citationIds: ["c2"] },
      { text: "A public filing confirms the round's size and lead investor [c5].", citationIds: ["c5"] }
    ],
    bearCase: [{ text: "Cloud providers could bundle a comparable managed browser runtime [c3].", citationIds: ["c3"] }],
    openQuestions: [{ question: "Can Browserbase defend against cloud providers bundling browser runtimes?", category: "durability" }],
    marketStructureAndTiming: {
      buyerBudget: null,
      painSeverity: null,
      adoptionTrigger: { text: "Agent rollouts are forcing teams to standardize browser infrastructure [c4].", citationIds: ["c4"] },
      marketStructure: null,
      profitPool: null,
      expansionPath: null,
      timingRisk: null
    }
  };
  await installChromeShim(page);
  await mockExtensionApi(page, card);
  await openSidePanel(page);

  const investorRead = page.getByRole("article", { name: "Investor read" });
  const footer = investorRead.locator(".cs-lens-footer-sources");
  await expect(footer.locator("a.cs-lens-source")).toHaveCount(4);
  const chip = footer.locator(".cs-lens-source-more");
  await expect(chip).toHaveText("+1");

  await chip.hover();
  const tooltip = page.locator(".cs-shared-tooltip");
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveAttribute("data-variant", "text");
  await expect(tooltip).toHaveAttribute("data-mode", "popover");
  await expect(tooltip).toContainText("Also cited");
});
