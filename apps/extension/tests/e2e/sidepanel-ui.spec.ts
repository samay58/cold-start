import { expect, test } from "@playwright/test";
import {
  browserbaseCard,
  browserbaseCardWithPeople,
  browserbaseCardWithSynthesis,
  fulfillJson,
  granolaCard,
  installChromeShim,
  mockExtensionApi
} from "./fixtures";
import { dragWithSamples, expectFocusedElementVisible, expectPointerAttached } from "./interaction-probes";

async function openSidePanel(page: Parameters<typeof installChromeShim>[0]) {
  await page.goto("/sidepanel.html");
  await expect(page.locator("#root > *")).toHaveCount(1);
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
  await expect(investorRead).toContainText("No supported break risk survived verification.");

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
  // The visible row diet: name, role, and the email action stay; channels and the copy
  // affordance move into the dossier.
  await expect(management.locator('a[href="mailto:charlie@conductor.build"]')).toBeVisible();
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
  await expect(peopleTooltip).toHaveAttribute("data-placement", "above");

  const factsBox = await facts.boundingBox();
  const managementBox = await management.boundingBox();
  const researchBox = await researchLayer.boundingBox();
  expect(factsBox?.y).toBeLessThan(managementBox?.y ?? 0);
  expect(managementBox?.y).toBeLessThan(researchBox?.y ?? 0);
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

  // The lens slot swaps to the running receipt while the one analysis run works.
  await expect(page.locator(".cs-lens-running")).toBeVisible();
  await expect(page.locator(".cs-lens-running")).toContainText("Investor Lens running");
  await page.locator(".cs-lens-slot").screenshot({ path: "/private/tmp/cold-start-lens-running.png" });
  await expect.poll(() => generationRequests).toMatchObject([
    { confirmStart: true, domain: "browserbase.com", mode: "analysis" }
  ]);
  expect(generationRequests[0]?.sectionId).toBeUndefined();
});


test("shared tooltip floats beside its trigger instead of falling into the page flow", async ({ page }) => {
  await installChromeShim(page);
  await mockExtensionApi(page, browserbaseCardWithPeople());
  await openSidePanel(page);

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
  const personBox = await person.boundingBox();
  const aboveBox = await tooltip.boundingBox();
  if (!personBox || !aboveBox) {
    throw new Error("Expected bounding boxes for the person row and its tooltip");
  }
  const gapAbove = personBox.y - (aboveBox.y + aboveBox.height);
  expect(gapAbove).toBeGreaterThanOrEqual(0);
  expect(gapAbove).toBeLessThan(48);

  const more = page.getByRole("button", { name: "Read the full company description" });
  await more.hover();
  await expect(tooltip).toContainText("hosted browser runtime");
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

test("timing files the remaining supported fields behind a tooltip affordance", async ({ page }) => {
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

  // The overflow count is an affordance, not a bare number: hovering files the rest.
  const more = timing.getByRole("button", { name: "+1 more" });
  await more.hover();
  const tooltip = page.locator(".cs-shared-tooltip");
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText("Also filed under Timing");
  await expect(tooltip).toContainText("Buyer budget. Platform teams own the browser-infrastructure budget.");
  await page.screenshot({ fullPage: true, path: "/private/tmp/cold-start-lens-timing-more.png" });
});

