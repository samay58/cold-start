---
title: Cold Start: Company Context Card
date: 2026-05-06
type: product-spec
status: approved-for-planning
owner: samay
brand: @semitechievc (personal)
domain: coldstart.semitechie.vc
tags: [career-pipeline, build-public, ai-native-investor-tools]
---

# Cold Start

## What it is

One click on any company website, get a cached sourced card quickly or start a fresh background generation when no card exists yet. The card lives at a public URL (`coldstart.semitechie.vc/c/{slug}`) so it can be tweeted, embedded in memos, and indexed. The Chrome side panel and a `/c/{slug}` web page render the same card; the extension adds gated synthesis (why it might matter, bull case, bear case, open questions) that the public URL does not.

The wedge is not "more data than Pitchbook." It is faster bearings on the company already in the tab.

## Why it wins

Three things, in order of importance.

First, **trust**. Every material fact links to a primary source. Claims that cannot be cited are dropped, not paraphrased. Pitchbook's tile asserts; Cold Start cites.

Second, **artifact gravity**. The card is a stable URL, not a chat reply. One generation per company, cached, shareable. Samay tweeting `coldstart.semitechie.vc/c/cartesia` and a colleague clicking the extension on cartesia.ai both hit the same page. This is the only thing that makes per-card economics work at scale.

Third, **investor lens, not data dump**. Buyer, wedge, GTM motion, what would have to be true. None of that is on Pitchbook. The lens lives behind the extension install (gated surface), so the public artifact stays defamation-clean.

## Two visibility tiers

This is the load-bearing decision. Resolved 2026-05-06.

**Public surface** (`coldstart.semitechie.vc/c/{slug}`) renders sourced facts only:
- Identity (name, domain, logo, structured description, HQ, founded year, status)
- Funding (total raised, last round, lead investors, all cited)
- Leadership (CEO, founders, with source links)
- Recent signals (news, hiring, launches, last 90 days, all linked)
- Closest comparables (via Exa `findSimilar`)
- Citation list (every claim resolves to a URL)

**Gated surface** (Chrome extension; web auth TBD, see open question #2) adds:
- Why it might matter (3 to 5 sentences, sourced)
- Bull case (3 bullets, each cited)
- Bear case (3 bullets, each cited)
- Open questions (3 prompts a partner would ask in a first call)

The Chrome install is the audience filter that lowers defamation exposure. Anyone can read facts; only investors who installed the extension see the synthesis.

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
      serves: string | null;
      mechanism: string | null;
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
  comparables: { name: string; domain: string; oneLiner: string }[];
  citations: Citation[];                // [{ id, url, title, fetchedAt, sourceType }]

  // GATED TIER (extension or auth required)
  synthesis?: {
    whyItMatters: SourcedText;          // each sentence ends with [n]
    bullCase: SourcedText[];            // exactly 3
    bearCase: SourcedText[];            // exactly 3
    openQuestions: string[];            // exactly 3
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

`partial` means at least one section was served from cache while another section was regenerated, such as identity remaining valid while signals expired.

Synthesis sentences must end in `[n]` matching a citation. The post-processor strips any sentence ending in `[needs_verification]`. This is structural, not vibes.

If a `ResolvedFact` has no citation, its `value` must be `null` and `status` must be `unknown`. The render layer hides null facts. No "TBD" cards.

The synthesis block is omitted entirely from the public JSON response. The web app's `/c/{slug}` page does not request it. The extension and authenticated `/c/{slug}?auth=...` requests do.

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

**Data plumbing** is the AgentCash + stableenrich path. As of 2026-05-06, stableenrich exposes Exa search, Exa findSimilar, Firecrawl scrape, and Apollo organization enrichment via AgentCash for the v0 company-card path. There is no AgentCash API key in this flow: AgentCash handles payment from a wallet, using the local `~/.agentcash/wallet.json` in development or `X402_PRIVATE_KEY` in deployed environments. The app pins the `agentcash` npm package and invokes the installed CLI, not `npx agentcash@latest` at request time. Free direct calls layer underneath: SEC EDGAR (no auth), GitHub REST (5K/hr with PAT), RDAP (free).

The AgentCash path collapses what Spec 3 modeled as separate vendor-account integrations into one wallet top-up plus a unified `fetch` interface. If a stableenrich endpoint turns out to be missing or unreliable during the day-1 spike, fall back to a direct account for that single call. Everything else stays on AgentCash.

**Pipeline** (single agent, parallel tool calls, no orchestrator-worker hierarchy):

```
Activation (extension click or URL navigation)
    ↓
Resolve identity (domain → canonical company)
    ↓
Parallel fan-out via Promise.all:
    ├── Stableenrich: Exa search (news, funding, launch, founders)
    ├── Stableenrich: Exa findSimilar(domain) → comparables
    ├── Stableenrich: Apollo org-enrich(domain) → firmographics
    ├── Stableenrich: Firecrawl(homepage)
    ├── EDGAR (if public)
    ├── GitHub (if org_url found in enrichment or page)
    └── RDAP (domain age)
    ↓
Claim extraction (Sonnet 4.6, structured output, JSON Schema enforced)
    ↓
Conflict resolution (deterministic rules: most recent authoritative source wins)
    ↓
Render public card from validated claims
    ↓ (if extension/authed)
Synthesis pass (Sonnet 4.6, claim-store as input, citation-or-cut enforced)
    ↓
Verifier pass (Sonnet 4.6, second call, asks "is each [n] supported by source [n]")
    ↓
Stream sections to client via Suspense
```

The verifier is cheap because the system prompt is cacheable and the per-card input is bounded by the citation count. It catches the "cited a source that doesn't actually support the claim" failure mode that base citation enforcement misses.

**Trust enforcement** (six structural checks, all run in v0):

1. JSON Schema on every tool output. Zod-validated. The model cannot return an unstructured number.
2. Citation IDs in synthesis are required by schema; missing IDs trigger regen.
3. Forbidden phrase regex on synthesis output: "reportedly," "industry sources suggest," "rumored to," "appears to be," "is said to." Any hit triggers regen.
4. Two-source rule on funding total, valuation, headcount. Single-source claims downgrade to `confidence: 'low'`.
5. Verifier pass re-reads synthesis with sources in context, returns supported/contradicted/unsupported per claim. Anything not `supported` is dropped.
6. Confidence badges visible in the UI. `verified` (green), `mixed` (amber, conflict surfaced), `inferred` (blue, AI-derived), `unknown` (gray).

## Cost model

Estimated per uncached card via AgentCash + stableenrich + Anthropic direct:

| Item | Cost |
|------|------|
| Stableenrich Exa search | $0.0100 |
| Stableenrich Exa findSimilar | $0.0100 |
| Stableenrich Apollo org-enrich | $0.0495 |
| Stableenrich Firecrawl scrape | $0.0126 |
| Sonnet 4.6 extraction (cached prompt) | ~$0.03 |
| Sonnet 4.6 synthesis (cached prompt) | ~$0.04 |
| Sonnet 4.6 verifier (cached prompt) | ~$0.01 |
| EDGAR / GitHub / RDAP | $0 |
| **Total** | **~$0.16 to $0.20** |

Cache hit (Postgres lookup, no LLM): ~$0.0001. At any meaningful traffic the blended cost converges toward the cache-hit case because popular domains (Notion, Stripe, OpenAI) get hit thousands of times.

This is conservative against Spec 3's $0.04 estimate and Spec 2's $0.15 estimate. Reality probably lands between $0.10 and $0.25 per uncached card; safe to plan around $0.20.

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

Day 20-21: Web app polish, landing page at `coldstart.semitechie.vc`. Twitter launch thread under @semitechievc. Manual posting of 5 to 10 cards to seed the public corpus.

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

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Stableenrich endpoint coverage gap | Medium | Day-1 spike; direct-vendor fallback per endpoint |
| AgentCash wallet drains during Twitter spike | Medium | Top-up alarm at $20 floor; cap free-tier rate at 25 cards/IP/day; cache aggressively |
| Defamation from bear case on extension | Medium | Bear case sentences must each cite a primary source; legal review of synthesis prompt before extension goes public; user feedback "report wrong" button writes to Postgres for triage |
| Pitchbook lawyers notice | Low | Public surface is sourced facts with citations, not Pitchbook data; no proprietary feed used; respond if they reach out |
| Sonnet 4.6 extraction fabricates a number | Medium | Forbidden-phrase regex; verifier pass; structured output with JSON Schema; manual review of first 25 cards |
| Chrome Web Store rejection | Low | Minimal permissions; clear privacy copy; web app is the immediate fallback while resubmitting |
| stableenrich endpoint price changes | Medium | AgentCash settings let you cap per-call spend; abstraction layer makes per-endpoint vendor swap a config change |
| Cache key collision (two companies, same name) | Medium | Slug includes domain disambiguator; pgvector similarity check at ingest |
| Single Sonnet 4.6 outage | Medium | Backup prompt path to GPT-5.x via the same JSON Schema; model swap is a config change plus prompt regression testing |

## Decisions made (record)

- Name: **Cold Start**.
- URL policy: **public sourced facts at `/c/{slug}`, gated synthesis behind extension or auth**.
- Data plumbing: **AgentCash + stableenrich primary, direct-vendor fallback per endpoint if needed**.
- Build pace: **3-week MVP, no Arc Boost POC, no weekend hack**.
- Backend: **Next.js 15 on Vercel + Inngest + Neon Postgres**.
- LLM: **Claude Sonnet 4.6, single agent, parallel tool calls, no orchestrator-worker in v0**.
- Bull/bear scope: **in v0 but only on extension surface; web public URL omits synthesis entirely**.
- X bot: **deferred to v1.1; manual @semitechievc posting in v0**.
- Brand: **personal under @semitechievc, no separate product handle until product proves out**.

## Open questions

These do not block the implementation plan but should be resolved before launch:

1. Domain: launch on `coldstart.semitechie.vc`.
2. Magic-link auth provider for web-side gated synthesis: Clerk, Auth.js, or skip entirely and require Chrome extension install for any synthesis access? Recommend skip; Chrome install is the auth.
3. First 50 companies for the golden eval set: Samay to draft the list (10 portfolio companies, 10 NYC AI infra, 10 Series A you've passed, 10 ambiguous, 5 public, 5 acquired/subsidiary).
4. Legal review of synthesis prompt template before extension launches publicly. Cheap insurance; one hour with a lawyer who reviews early-stage product copy.
5. Whether the public URL surface pre-renders the OG card image at generation time (saves runtime cost on viral tweets) or lazy-generates on first share.

## Handoff

This spec is ready for `/superpowers:writing-plans` to convert into a step-by-step implementation plan. The plan should be split by week (week 1 = backend + claim store; week 2 = web app + public card; week 3 = extension + launch) with explicit checkpoints at the end of each week.

The day-1 stableenrich spike is the highest-risk single task. If it fails, the data path falls back to direct-vendor accounts (PDL, Exa, Firecrawl) and the timeline slips by 2 to 4 days. Plan should reflect this contingency.
