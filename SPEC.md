---
title: Cold Start: Company Context Card
date: 2026-05-06
type: product-spec
status: implemented-internal-testing
owner: samay
brand: @semitechievc (personal)
domain: cold-start-samay58s-projects.vercel.app
custom_domain_target: coldstart.semitechie.vc
internal_deployment: https://cold-start-samay58s-projects.vercel.app
tags: [career-pipeline, build-public, ai-native-investor-tools]
---

# Cold Start

## What it is

One click on any company website, get a sourced basics card quickly, then choose whether to run deeper investor analysis. The card lives at a public URL (`cold-start-samay58s-projects.vercel.app/c/{slug}` today, with `coldstart.semitechie.vc/c/{slug}` reserved as the future custom-domain target) so it can be tweeted, embedded in memos, and indexed. The Chrome side panel and a `/c/{slug}` web page render the same public facts; the extension adds gated synthesis, supported claims, and open questions that the public URL does not.

Cold Start aims to make old company-intel tiles obsolete by matching table-stakes fundamentals and exceeding them with citations, speed, and investor judgment. The first card must cover the basics: identity, domain, management team, public funding history, source quality, and citations. The deeper read earns attention only after those boxes are checked.

## Why it wins

Four things, in order of importance.

First, **fundamentals coverage**. A user should not have to forgive the product for missing table stakes. Identity, domain, team, funding, and basic source quality should appear before synthesis.

Second, **trust**. Every material fact links to a source. Claims that cannot be cited are dropped, not paraphrased. Legacy tiles assert; Cold Start cites.

Third, **artifact gravity**. The card is a stable URL, not a chat reply. One generation per company, cached, shareable. Samay sharing `cold-start-samay58s-projects.vercel.app/c/cartesia` and a colleague clicking the extension on cartesia.ai both hit the same page. This is the only thing that makes per-card economics work at scale.

Fourth, **investor lens, not data dump**. Cold Start should read like the first 10 minutes of a sharp investment screen, not a company encyclopedia. The gated read should explain who buys, what workflow changes, why the market is structurally attractive or not, what proof exists, what could break, and what diligence question comes next. The lens lives behind the extension install (gated surface), so the public artifact stays defamation-clean.

## Two visibility tiers

This is the load-bearing decision. Resolved 2026-05-06.

**Public surface** (`/c/{slug}` on the current deployed origin) renders sourced facts only:
- Identity (name, domain, logo, structured description, HQ, founded year, status)
- Funding (total raised, last round, lead investors, all cited)
- Leadership (CEO, founders, with source links)
- Recent signals (news, hiring, launches, last 90 days, all linked)
- Closest comparables (via Exa `findSimilar`)
- Citation list (every claim resolves to a URL)

**Gated surface** (Chrome extension in v0; web-side gated auth is intentionally deferred) adds:
- Why it matters, as a cited investment rationale rather than generic summary copy
- Product and technology, including what is actually differentiated
- Buyer and use case, including who uses it, who pays, and what workflow changes
- Customer proof, traction, financing and valuation, and competitive position when supported by cited card data
- Risks and diligence, including the questions a partner would ask before spending more time

The Chrome install is the audience filter that lowers defamation exposure. Anyone can read facts; only investors who installed the extension see the synthesis.

## Investor-grade research taxonomy

The research layer should use investment-screen language everywhere visible to the user. Internal field names may remain compatibility aliases until a schema migration, but UI, prompts, docs, QA, and screenshots should converge on this vocabulary.

| Current or internal source | User-facing card | Purpose |
|---|---|---|
| `synthesis.whyItMatters` / rationale alias | **Why It Matters** | The crisp reason this company could deserve investor attention. |
| `identity.description.mechanism` | **Product & Technology** | What the product does and what is actually differentiated. |
| `identity.description.serves` | **Buyer & Use Case** | Who uses it, who pays, and what workflow changes. |
| `synthesis.marketStructureAndTiming` / `marketStructureTiming` | **Market Structure & Timing** | Whether the market is real, reachable, timely, and economically attractive, based on buyer budget, adoption trigger, profit pool, structure, expansion path, and timing risk. |
| `customers` enrichment | **Customer Proof** | Named customers, pilots, deployments, usage evidence, or credible buyer adoption. |
| `signals` | **Traction** | Momentum across revenue clues, usage, hiring, launches, partnerships, news, or funding events. |
| `funding` / `investors` | **Financing & Valuation** | Round history, backers, amount raised, price context, and valuation only when disclosed by sources. |
| `comparables` / `competition` | **Competitive Position** | Alternatives, substitutes, incumbents, and the durability of the company's advantage. |
| diligence prompts | **Risks & Diligence** | What still needs to be proven before conviction. |

The next investor-grade expansion should add typed cards only when the backend can support them with real evidence:

| Future card | Standard |
|---|---|
| **Business Model & Unit Economics** | Explain pricing, gross margin pressure, CAC/payback clues, burn efficiency, and whether the model can compound. Use `not disclosed` rather than inferred numbers. |
| **Team & Execution** | Founder quality, technical credibility, hiring velocity, and evidence of execution. |
| **Strategic Relevance** | Platform, ecosystem, compute, partnership, internal adoption, or strategic-investor value. For NVentures-style use, this must be specific enough to say where NVIDIA could care and where it probably does not. |

The market card has the highest bar. It should not answer "how big is the TAM?" first. It should answer whether the market is real, reachable, timely, and economically attractive.

## Card schema

```typescript
type ColdStartCard = {
  slug: string;                         // canonical
  domain: string;
  generatedAt: string;
  generationCostUsd: number;
  cacheStatus: 'hit' | 'partial' | 'miss';

  // PUBLIC TIER
  identity: {
    name: ResolvedFact<string>;
    logoUrl: string | null;
    oneLiner: ResolvedFact<string>;     // compatibility display alias
    description?: ResolvedFact<{
      shortDescription: string;
      concept: string | null;
      serves: string | null;            // compatibility field; user-facing label is Buyer & Use Case
      mechanism: string | null;         // compatibility field; user-facing label is Product & Technology
    }>;
    hq: ResolvedFact<{ city: string; country: string }>;
    foundedYear: ResolvedFact<number>;
    status: 'private' | 'public' | 'acquired' | 'shutdown';
  };
  funding: {
    totalRaisedUsd: ResolvedFact<number | null>;
    lastRound: ResolvedFact<Round | null>;
    rounds?: ResolvedFact<Round[]>;
    investors: ResolvedFact<Investor[]>;
  };
  team: {
    founders: ResolvedFact<Person[]>;
    keyExecs: ResolvedFact<Person[]>;
    headcount: ResolvedFact<{ value: number; asOf: string } | null>;
  };
  signals: Signal[];                    // last 90d, each with url + date + category
  comparables: {
    name: string;
    domain: string;
    oneLiner: string;
    basis?: string;
    confidence?: 'high' | 'medium' | 'low';
    citationIds?: string[];
  }[];
  citations: Citation[];                // includes sourceQuality when available

  // GATED TIER (extension or auth required)
  synthesis?: {
    whyItMatters: SourcedText;          // each sentence ends with [n]
    bullCase: SourcedText[];            // 0-3 after verifier drops
    bearCase: SourcedText[];            // 0-3 after verifier drops
    openQuestions: string[];            // up to 3
    marketStructureAndTiming?: {
      buyerBudget: SourcedText | null;
      painSeverity: SourcedText | null;
      adoptionTrigger: SourcedText | null;
      marketStructure: SourcedText | null;
      profitPool: SourcedText | null;
      expansionPath: SourcedText | null;
      timingRisk: SourcedText | null;
    };
  };
};

type ResolvedFact<T> = {
  value: T | null;
  status: 'verified' | 'mixed' | 'inferred' | 'unknown';
  confidence: 'high' | 'medium' | 'low';
  citationIds: string[];                // resolves into top-level citations[]
};
```

Three rules that fall out of this schema.

`partial` means the card is intentionally incomplete but useful. In the fundamentals sprint, `basics` can write a partial card without synthesis so the user sees sourced identity, team, funding, signals, and citations first. Later it can also mean one section was served from cache while another section was regenerated, such as identity remaining valid while signals expired.

Synthesis sentences must end in `[n]` matching a citation. The post-processor strips any sentence ending in `[needs_verification]`. This is structural, not vibes.

If a `ResolvedFact` has no citation, its `value` must be `null` and `status` must be `unknown`. The render layer hides null facts. No "TBD" cards.

The synthesis block is omitted entirely from the public JSON response. The web app's `/c/{slug}` page does not request it. The extension API can return it after extension auth, and only when `analysis` has produced verified synthesis.

The LLM is asked for three bull and three bear claims, but storage is stricter than layout. After verification, unsupported and contradicted claims are removed rather than padded back to three. An empty bull or bear section means nothing in that section survived citation verification.

## Architecture

**Stack**:

| Layer | Pick | Reasoning |
|-------|------|-----------|
| Web framework | Next.js 15 App Router (PPR + Suspense streaming) | Streaming card rendering is the v0 visible quality lever; PPR lets the static shell render in <500ms while sections stream |
| Hosting | Vercel | Best fidelity on Next.js features that matter here; switch to self-hosted only if cost forces it |
| DB | Neon Postgres + pgvector | Free tier covers v0; pgvector for fuzzy company matching across slugs |
| Cache | Postgres `cards` table with TTLs per section | Identity 7d, signals 6h, synthesis 24h |
| Object store | Cloudflare R2 | OG images for X previews; egress-free |
| Background jobs | Inngest | Step functions map to the card pipeline; 60-90s deep generations cannot run in a request handler |
| LLM | Claude Sonnet 4.6 (Anthropic direct) | Single model for extraction + synthesis in v0; prompt caching reduces repeated system-prompt cost, up to ~90% at steady traffic |
| Extension | MV3 + Side Panel API + Vite + CRXJS + React + Tailwind + shadcn | Standard 2026 stack; side panel persists across navigation |

**Data plumbing** starts with direct Exa for fast fundamentals, then uses StableEnrich and AgentCash as fallback and enrichment. Direct Exa uses `DIRECT_EXA_API_KEY` for fast company, people, funding, and news searches. StableEnrich exposes Exa search, Exa findSimilar, Firecrawl scrape, and Apollo organization enrichment via AgentCash for the richer v0 company-card path. There is no AgentCash API key in this flow: AgentCash handles payment from a wallet, using the local `~/.agentcash/wallet.json` in development or `X402_PRIVATE_KEY` in deployed environments. The app pins the `agentcash` npm package and invokes the installed CLI, not `npx agentcash@latest` at request time. Free direct calls layer underneath: SEC EDGAR (no auth), GitHub REST (5K/hr with PAT), RDAP (free).

The AgentCash path collapses what Spec 3 modeled as separate vendor-account integrations into one wallet top-up plus a unified `fetch` interface. If a StableEnrich endpoint is missing or unreliable, fall back to a direct account for that single call. Everything else stays on AgentCash.

Provider budgets are executable, not just spreadsheet assumptions. StableEnrich endpoint timeout, expected facts, estimated cost, mode, and stop condition live in `packages/providers/src/provider-budget.ts`; generation traces copy that metadata next to endpoint results. Adding a paid endpoint without registering its budget is a contract miss.

**Generation modes**:

`basics` is the extension activation path. The side panel asks before starting it; the request carries `confirmStart` after that click. The API still accepts extension-authenticated basics requests without `confirmStart` for compatibility, but non-extension requests need confirmation. The target is p95 under 10 seconds for the first useful card. It retrieves fast fundamentals, extracts cited facts, skips synthesis, and may cache `cacheStatus: "partial"`.

`analysis` is the deeper gated path. It always requires extension auth plus explicit confirmation. It can reuse the existing basics card, run richer retrieval and synthesis, then upgrade the same card only when supported claims and diligence prompts survive verification. In the refreshed extension UX, the user should experience this as activating specific research cards, not pressing a separate global Analyze button. The first implemented card set uses Why It Matters, Buyer & Use Case, Market Structure & Timing, Customer Proof, Traction, Financing & Valuation, Competitive Position, Product & Technology, and Risks & Diligence. The backend still supports card-level `basics` and `analysis` jobs today, but generation runs now carry `jobKind` and trace metadata so true per-enrichment jobs can land without a second stale progress model.

Before an `analysis` run attempts synthesis, it checks a floor over the citations already on the card: at least 8 cited sources (env-tunable via `ANALYSIS_SYNTHESIS_MIN_CITATIONS`) and at least one citation whose source type is not `enrichment`. Missing either one blocks synthesis outright; the run does not attempt it and does not spend the call. Three more signals ride along as advisories rather than blockers: whether the citations span more than one source class, whether any citation backs a funding fact, and whether any citation backs a named founder or exec. Advisories describe the read without stopping it. A blocked run writes a `synthesisWithheld` record onto the gated card: when it ran, which reasons blocked it, which advisories applied, and the citation and source-type counts at the time. The record lives in the gated tier only, next to `synthesis`, and is stripped from the public card like every other synthesis field. It clears the next time a run produces real synthesis. When a caller asks for analysis again and the card's evidence has not moved since the last withheld verdict, the route answers with that same verdict for free instead of spending another run; a request that sets `forceRefresh` always attempts a fresh run regardless of the standing verdict. The extension renders a withheld verdict as its own honest state, distinct from a synthesis read and distinct from a run failure, naming what is missing and offering the one action that can change it.

`mode` is the profile tier. `jobKind` is the exact job. Initial extension generation is `mode=basics`, `jobKind=basics`; later investor synthesis is `mode=analysis`, `jobKind=analysis`; section runs use `jobKind=section:<id>` and inherit `mode` from section visibility.

Generation runs also write small product-facing events. Traces remain for debugging. Events are for the extension. A run event says what the system actually did: queued a section, found sources, saved the first usable card, checked contact sources, saved enrichment, completed, or failed. The extension can show these events without parsing `trace_json`.

**Pipeline** (single agent, parallel provider calls, no orchestrator-worker hierarchy):

```
Activation (extension click)
    ↓
Basics request
    ↓
Direct Exa fast fundamentals:
    ├── company profile
    ├── people and management team
    ├── funding history
    └── recent signals
    ↓
StableEnrich / AgentCash fallback and enrichment:
    ├── Exa search, recent signals, and findSimilar
    ├── Apollo org-enrich
    └── Firecrawl(homepage)
    ↓
Claim extraction (Sonnet 4.6, structured output, JSON Schema enforced)
    ↓
Trust pass and public card cache
    ↓
User activates a research-layer card
    ↓
Analysis retrieval, synthesis, verifier, trace capture
    ↓
Upgrade cached card with gated synthesis
```

The verifier is cheap because the system prompt is cacheable and the per-card input is bounded by the citation count. It catches the "cited a source that doesn't actually support the claim" failure mode that base citation enforcement misses.

**Trust enforcement** (structural checks, all run in v0):

1. JSON Schema on every tool output. Zod-validated. The model cannot return an unstructured number.
2. Citation IDs in synthesis are required by schema; missing IDs trigger regen.
3. Forbidden phrase regex on synthesis output: "reportedly," "industry sources suggest," "rumored to," "appears to be," "is said to." Any hit triggers regen.
4. Public web sources can produce `status: 'verified'` when the source actually supports the claim.
5. Vendor-only facts can display with vendor source context, but stay `status: 'inferred'` and lower confidence unless corroborated.
6. Two-source rule on funding total, valuation, headcount. Single-source claims downgrade to `confidence: 'low'`.
7. Verifier pass re-reads synthesis with sources in context, returns supported/contradicted/unsupported per claim. Anything not `supported` is dropped.
8. Card schema rejects non-null citation-bearing facts without refs and rejects refs that do not resolve to the top-level `citations[]`.
9. Public reads derive from `cards.card_json` at request time. `cards.public_card_json` is a temporary compatibility cache, not authority.
10. Cache reads enforce TTLs by mode: `basics` needs fresh identity and signals; `analysis` also needs fresh synthesis.
11. Confidence badges visible in the UI. `verified` (green), `mixed` (amber, conflict surfaced), `inferred` (blue, AI-derived), `unknown` (gray).

## Cost model

Provider budget registry values for paid StableEnrich calls:

| Item | Cost |
|------|------|
| Stableenrich Exa search | $0.0100 |
| Stableenrich Exa findSimilar | $0.0100 |
| Stableenrich Apollo org-enrich | $0.0200 |
| Stableenrich Firecrawl scrape | $0.0100 |
| Stableenrich email enrichment or verification | $0.0100 to $0.0200 |
| EDGAR / GitHub / RDAP | $0 |

Observed production target after the May cost cuts is roughly `$0.75` for basics and `$0.88` for analysis, including provider calls plus Anthropic extraction, synthesis, and verification. Treat those as trace-derived operating targets, not fixed prices. Use `npm run trace:generation -- --quality --detail` for current runs.

Cache hit (Postgres lookup, no LLM): ~$0.0001. At any meaningful traffic the blended cost converges toward the cache-hit case because popular domains (Notion, Stripe, OpenAI) get hit thousands of times.

## 3-week MVP plan

**Week 1: backend + claim store**

Day 1: Spike on stableenrich. Confirm Exa search, Exa findSimilar, Firecrawl scrape, and Apollo org enrichment all work via AgentCash fetch. List any gaps; if any, decide direct-vendor fallback for that endpoint.

Day 2-3: Next.js scaffold on Vercel. Postgres schema for `cards`, `claims`, `citations`, `sources`. Inngest project wired up. AgentCash client wrapper. Sonnet 4.6 client with prompt caching.

Day 4-5: Claim extraction pipeline. Run end-to-end on 5 hand-picked companies (Cartesia, Stripe, Linear, a Series A you know well, a public company). Validate structured output, citations resolve, no hallucinated facts.

Day 6-7: Conflict resolution + verifier pass + forbidden-phrase regex. Run on 25 companies. Manually score: identity correct, funding correct, no fabricated citations.

**Week 2: web app + public card**

Day 8-10: `/c/{slug}` page with PPR + Suspense streaming. Sections: identity → funding → team → signals → comparables. Citation hover popovers. Confidence badges.

Day 11-12: pgvector slug normalization. Cache hit path. OG image generation via `@vercel/og` (logo + one-liner + funding headline). 24h TTL on synthesis cache, 6h on signals, 7d on identity.

Day 13-14: Eval harness. Hand-curated 50-company golden set. Promptfoo for prompt regression. Manual review on first 25 generated cards before any public sharing.

**Week 3: Chrome extension + launch**

Day 15-17: Extension scaffold (Vite + CRXJS, MV3, Side Panel API). URL capture, page metadata, backend stream call. Side panel renders the full card including gated synthesis section. `chrome.sidePanel.open()` in user-gesture handler (synchronous; must not be inside `await`).

Day 18-19: Privacy copy, manifest minimal permissions (`sidePanel`, `activeTab`, `scripting`, `storage`). Submit to Chrome Web Store. First-submission review may take up to several weeks; web app is the launch surface while review is pending.

Day 20-21: Web app polish, landing page on the current deployed origin unless the custom domain is already wired. Twitter launch thread under @semitechievc. Manual posting of 5 to 10 cards to seed the public corpus.

## What's NOT in v0

Defer all of this to v1.1 or later:

- X bot polling and auto-reply (Spec 2 wedge; defer to month 2).
- Orchestrator-worker Deep tier (Opus 4.7 + Haiku 4.5 workers; Spec 2 architecture).
- LinkedIn-native deep enrichment beyond what stableenrich already exposes.
- Raycast extension (Spec 1, Spec 3 propose; defer to month 3).
- Watchlist, save-to-list, alerts, change monitoring.
- API access tier (`POST /api/analyze`).
- Contact emails, founder personal contact info.
- Valuation estimates not present in source data.
- "Should I invest" scoring.
- iOS app, Slack bot, MCP endpoint.

The discipline is: every v0 feature must serve the activation moment. For cached companies, the card should appear immediately. For uncached companies, one click starts a 60 to 90 second sourced generation. If a feature serves a different moment, it's v1.

## Research section state

The extension shows nine research cards. Each card has one saved server state, so the UI does not infer whether work happened:

```text
buyer
customer_proof
traction
financing
competition
product
why_it_matters
market
risks
```

Each section is stored in `research_sections` with one status:

```text
not_started
running
available
empty
failed
stale
```

Snapping a card into place only saves the local pin. It does not start generation. The extension renders the saved section state:

- `available`: show content.
- `empty`: show the honest evidence gap.
- `failed`: show the saved error and a retry action.
- `running`: show progress.
- `stale`: show old content with a refresh action.
- `not_started`: show a generate action.

Old cards can derive fallback section state from `cards.card_json`, but new generation writes section rows. Section rows win over fallback.

The extension bootstrap also returns compact source summaries and recent run events:

```text
card
sections
runs
sources
events
```

`sources` are capped summaries for display. `events` are recent activity rows, not raw traces. Public routes do not expose gated section content or generation traces.

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Fast fundamentals miss table stakes | High | Direct Exa first, StableEnrich fallback, golden-set coverage targets for identity, team, and funding |
| StableEnrich endpoint coverage gap | Medium | Direct-vendor fallback per endpoint |
| AgentCash wallet drains during Twitter spike | Medium | Top-up alarm at $20 floor; cap free-tier rate at 25 cards/IP/day; cache aggressively |
| Defamation from gated synthesis | Medium | Skeptical claims must each cite a primary source; legal review of synthesis prompt before extension goes public; user feedback "report wrong" button writes to Postgres for triage |
| Legacy data providers notice | Low | Public surface is sourced facts with citations, not proprietary feed replication; no private provider feed used unless licensed |
| Sonnet 4.6 extraction fabricates a number | Medium | Forbidden-phrase regex; verifier pass; structured output with JSON Schema; manual review of first 25 cards |
| Chrome Web Store rejection | Low | Minimal permissions; clear privacy copy; web app is the immediate fallback while resubmitting |
| stableenrich endpoint price changes | Medium | AgentCash settings let you cap per-call spend; abstraction layer makes per-endpoint vendor swap a config change |
| Cache key collision (two companies, same name) | Medium | Slug includes domain disambiguator; pgvector similarity check at ingest |
| Single Sonnet 4.6 outage | Medium | Backup prompt path to GPT-5.x via the same JSON Schema; model swap is a config change plus prompt regression testing |

## Decisions made (record)

- Name: **Cold Start**.
- URL policy: **public sourced facts at `/c/{slug}`, gated synthesis behind extension or auth**.
- Data plumbing: **Direct Exa fast fundamentals first, StableEnrich and AgentCash fallback and enrichment**.
- Build pace: **3-week MVP, no Arc Boost POC, no weekend hack**.
- Backend: **Next.js 15 on Vercel + Inngest + Neon Postgres**.
- LLM: **Claude Sonnet 4.6, single agent, parallel tool calls, no orchestrator-worker in v0**.
- Bull/bear scope: **in v0 but only on extension surface; web public URL omits synthesis entirely**.
- Research-card language: **investor-grade labels over generic database labels**. Buyer & Use Case, Product & Technology, Traction, and Market Structure & Timing replace generic database wording and top-down TAM filler.
- X bot: **deferred to v1.1; manual @semitechievc posting in v0**.
- Brand: **personal under @semitechievc, no separate product handle until product proves out**.

## Open questions

These do not block the implementation plan but should be resolved before public launch:

1. Domain: current internal launch uses `https://cold-start-samay58s-projects.vercel.app`; switch to `https://coldstart.semitechie.vc` only after DNS is wired and `NEXT_PUBLIC_WEB_ORIGIN` is updated.
2. Web-side gated synthesis: continue requiring Chrome extension install for v0. Revisit Clerk/Auth.js only if non-extension users need synthesis.
3. First 50 companies for the golden eval set: Samay to draft the list (10 portfolio companies, 10 NYC AI infra, 10 Series A you've passed, 10 ambiguous, 5 public, 5 acquired/subsidiary).
4. Legal review of synthesis prompt template before extension launches publicly. Cheap insurance; one hour with a lawyer who reviews early-stage product copy.
5. Whether the public URL surface pre-renders the OG card image at generation time (saves runtime cost on viral tweets) or lazy-generates on first share.

## Current Handoff

Treat this file as the live product contract. Code changes that affect card shape, trust boundaries, generation modes, public/private visibility, provider cost, or research-layer labels should update this file in the same branch.

The current data path is direct Exa plus StableEnrich through AgentCash, with SEC EDGAR and Firecrawl where useful. If a StableEnrich endpoint becomes unreliable, add or restore a direct fallback for that endpoint only and document the new budget in `packages/providers/src/provider-budget.ts`.
