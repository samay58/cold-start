# Cold Start Intent

This document is for agents and collaborators who need to understand what this repo is trying to become before touching implementation details. `SPEC.md` remains the product source of truth, `DESIGN.md` remains the visual source of truth, and `AGENTS.md` remains the working guide. This file states the product idea in plain language and separates known intent from unresolved questions.

## One-Sentence Intent

Cold Start is an investor-grade company context card: click a company website, get a sourced, cached, shareable card of public facts, with more judgmental bull/bear synthesis gated behind the Chrome extension.

## Product Thesis

The wedge is fast bearings on the company already in the user's browser tab. This is not trying to out-database Pitchbook. It is trying to be the thing an investor opens when they need to understand, in under a minute, what a company does, what is publicly known, what changed recently, and what questions matter next.

The repo's clearest product line is in `README.md` and `SPEC.md`: "Pitchbook's tile asserts; Cold Start cites." That sentence should shape almost every implementation choice. A fact without provenance is worse than an empty field. A confident-looking uncited card violates the product.

Cold Start is also deliberately an artifact product, not a chat product. The unit is a stable card at `/c/{slug}`, not a transient answer. The shareable URL matters because it lets one expensive generation become a reusable public object.

## Intended User

The primary user is a busy investor, builder-investor, or deal person looking at a company in context. The current brand and domain make this personally attached to `@semitechievc`, not a neutral enterprise SaaS surface.

The user likely wants:

- A quick answer to "what is this company, really?"
- Publicly sourced facts they can trust enough to forward.
- A source list they can inspect when a number or claim matters.
- A sharper investor read than a company homepage or database tile provides.
- Open questions that improve a first call or diligence screen.

The product should not assume the user wants a full memo, CRM workflow, outbound list, contact enrichment surface, or investment recommendation.

## What The Product Is

Cold Start has two deliberately different visibility tiers.

The public tier is the shareable web card at `/c/{slug}` plus `/api/cards/{slug}`. It contains sourced public facts only. In the current schema those facts are identity, structured company description, funding, team, recent signals, comparables, and citations. The public API and page must not expose `synthesis`.

The gated tier is the Chrome side panel plus `/api/extension/cards/{slug}`. It returns the full cached card after extension identity and token checks. This is where investor synthesis belongs: why the company might matter, bull case, bear case, and open questions.

The generation path starts from a domain. The intended path is:

```text
domain or active tab
  -> canonical domain and slug
  -> optional research plan
  -> provider retrieval
  -> evidence ledger
  -> LLM extraction into typed card sections
  -> synthesis
  -> verifier
  -> trust sanitization
  -> DB cache
  -> public or gated rendering
```

## What The Product Is Not

This is not a Pitchbook clone. It should not become a private-company database with a different skin.

It is not a chatbot. Chat may become an interaction later, but the card is the product object.

It is not a contact scraping or outbound automation tool. The privacy page explicitly says it does not scrape contacts, send outbound messages, act as a CRM, or make investment recommendations.

It is not an investment score. The synthesis can frame a bull case, bear case, and questions, but it should not imply "invest" or "pass."

It is not a generic data dump. The investor lens matters: buyer, workflow, wedge, proof, friction, funding cadence, and what would change the read.

## Load-Bearing Product Decisions

The public/private split is the most important architectural and legal decision. Public surfaces show cited facts. Gated surfaces show synthesis. The code backs this up by storing both `cardJson` and `publicCardJson`, using `publicCard()` before public storage and reads, and keeping `/api/cards/{slug}` on the public repository path.

Citation discipline is not decorative. `ResolvedFact<T>` requires `value`, `status`, `confidence`, and `citationIds`. `sanitizeCardTrust()` nulls facts whose citation IDs are missing or invalid. Signals without valid citations are dropped. `publicCard()` strips synthesis entirely.

Synthesis is optional and must survive verification. The LLM synthesis parser requires visible citation markers to match `citationIds`; the pipeline asks a verifier to mark claims as supported, contradicted, or unsupported; unsupported synthesis is dropped. The implementation intentionally preserves the extracted public card even when synthesis fails.

The extension is an audience filter. `assertExtensionRequest()` requires a bearer token and extension identity or allowed origin, and it fails closed in production if local sentinel values or wildcard extension origins leak in.

Generation is background work. `/api/generate` checks cache and active runs, records a queued generation, and sends an Inngest event. Long-running provider and LLM work belongs in the Inngest function, not the request handler.

Generation requires explicit confirmation. `/api/generate` rejects requests without `confirmStart: true`, and the extension shows a "Generate?" screen before spending provider/LLM budget on a missing card.

The cache is part of the product economics. The DB stores generated cards with section TTLs: identity 7 days, signals 6 hours, synthesis 24 hours. Code currently stores those expirations, though partial section regeneration is not fully implemented.

## Trust Model

Cold Start should earn trust through structure, not tone.

Facts:

- A fact with no valid citation becomes `unknown`, not a pretty guess.
- Missing facts render as not publicly disclosed or empty states.
- Funding totals require explicit support or a reconciled round ledger.
- Source quality matters. Independent technical and analysis sources carry more judgment weight than press releases or enrichment data.
- Conflicts should become `mixed`, not averaged away.

Synthesis:

- Synthesis can only use citations already on the card.
- Why-it-matters and every bull/bear line must include visible citation markers.
- Forbidden hedge phrases such as "reportedly" and "appears to be" are stripped or rejected.
- If the verifier cannot support the lede, the entire synthesis block is removed.
- The public route must never leak synthesis.

Design:

- Citations, timestamps, source quality, confidence, domains, and dollar amounts are not housekeeping. They are part of the product's visible trust machinery.

## Card Content Model

The public card is shaped around these sections:

- Identity: name, domain, logo, one-liner, structured description, HQ, founded year, status.
- Funding: total raised, last round, optional round ledger, investors.
- Team: founders, key executives, headcount.
- Signals: recent public events such as news, hiring, launches, funding, filings, GitHub, or other signals.
- Comparables: nearby companies from similarity search.
- Sources: citation list with source type and source quality.

The gated card adds:

- Why it might matter.
- Bull case.
- Bear case.
- Open questions.

The description model is especially important. It is not a slogan field. It tries to capture what the company does, the non-obvious product concept, who it serves, and how the mechanism works.

## Architecture Intent

The monorepo boundaries are meaningful:

- `packages/core` owns schema, slugging, trust rules, source quality, and public redaction. It should stay free of DB, network, and provider dependencies.
- `packages/db` owns Drizzle schema, repository reads/writes, public/full card persistence, generation runs, claims, citations, and sources.
- `packages/providers` owns AgentCash and stableenrich calls, plus fallback configuration scaffolding.
- `packages/llm` owns Anthropic client setup, research planning, extraction tool schemas, synthesis tool schemas, and verifier parsing.
- `packages/pipeline` owns orchestration across providers, evidence ledger construction, extraction, synthesis, verification, and final sanitization.
- `packages/ui` owns presentational card rendering. It receives a card and should not fetch data.
- `apps/web` owns public pages, APIs, generation queueing, Inngest serving, and auth gating.
- `apps/extension` owns active-tab capture, settings, cache fetch, explicit generation start, polling, and side-panel rendering.

The cleanest mental model is: core defines what a valid card is, pipeline creates one, db stores both full and public versions, web and extension choose which version to show.

## Retrieval And LLM Intent

The retrieval layer should answer investor questions, not just fill fields. The research planner asks what matters for the company first, then builds funding, company profile, and independent analysis queries.

The current provider path is stableenrich through AgentCash:

- Exa search for funding history.
- Exa search for company profile.
- Exa search for independent analysis.
- Exa findSimilar for comparables.
- Firecrawl scrape of homepage.
- Apollo org enrichment.

The spec also talks about EDGAR, GitHub, and RDAP, but the code currently centers on stableenrich. Treat the other source types as intended extension points unless they are implemented later.

The LLM should be treated as a structured extractor and cautious synthesizer. It should not freewrite the card. Tool schemas, zod parsing, citation validation, and verifier drops are the product's guardrails.

## UX And Brand Intent

The visual metaphor is an observatory instrument around a readable memo. The dark shell is the measuring environment. The card itself is a warm, legible document.

This should not become a generic dark dashboard. The design docs call for a deep observatory shell, a warm memo card, Berkeley Mono for inspected values, Lens Blue for citations and active states, and visible provenance as part of the aesthetic.

The extension is dense and scannable at Chrome side-panel width. The web card has more breathing room and should work as a social/share artifact. Both surfaces should feel like the same instrument viewing the same card.

## Current Implementation Truths

These are true from the current code, not merely from product docs:

- The public API reads `findPublicCardBySlug()` and never calls `getFullCachedCard()`.
- The extension API calls `assertExtensionRequest()` before reading the full card.
- Public card storage is separately materialized as `publicCardJson`.
- `sanitizeCardTrust()` nulls uncited or invalidly cited facts.
- `stripUnsupportedSynthesis()` can remove individual synthesis lines or the whole synthesis block.
- Synthesis failures do not fail the whole card generation path.
- Generation is queued through Inngest and tracked in `generation_runs`.
- The extension opens the side panel synchronously on action click, then writes the active domain to session storage.
- The side panel first checks for a cached full card. If missing, it asks the user to start generation and then polls.
- Production extension auth rejects wildcard Chrome origins, localhost origins, local extension IDs, and the local token sentinel.

## Current Gaps Or Tensions

These are places where docs, code, or product intent do not fully line up yet:

- Slugs are currently the first hostname label, so `foo.com` and `foo.ai` collide as `foo`. The spec mentions domain disambiguation, but the implementation has not solved it.
- `cacheStatus: "partial"` and per-section TTLs exist, but partial section regeneration is not implemented as a complete behavior.
- DB schema has `claim_visibility = public | gated`, but `recordCardEvidence()` currently records public claims only.
- The spec mentions EDGAR, GitHub, and RDAP source paths. The current provider implementation does not fetch them.
- The pipeline exposes `generationCostUsd`, but the Inngest path does not pass live provider/LLM cost lines, so observed costs may remain `0` until cost accounting is wired.
- The synthesis parser asks for exactly three bull, three bear, and three open questions, but post-verifier filtering may leave fewer. The UI can render fewer or empty states.
- Comparables do not carry citation IDs in the current card schema. They come from provider output but are not inspectable at the same claim level as facts.
- `claims` stores only selected public fact paths. Signals, comparables, gated synthesis, verifier drops, and source failures are not represented as first-class claim/debug rows yet.

## Source Pointers

Read these files when validating or changing intent-critical behavior:

- Product truth: `README.md`, `SPEC.md`, `DESIGN.md`.
- Agent working context: `AGENTS.md`.
- Card schema and redaction: `packages/core/src/card.ts`, `packages/core/src/trust.ts`.
- Source incentives: `packages/core/src/source-quality.ts`.
- Pipeline assembly: `packages/pipeline/src/generate-card.ts`, `packages/pipeline/src/evidence-ledger.ts`.
- Retrieval: `packages/providers/src/stableenrich.ts`, `packages/providers/src/agentcash.ts`.
- LLM behavior: `packages/llm/src/investor-taste-kernel.ts`, `packages/llm/src/research-plan.ts`, `packages/llm/src/extraction.ts`, `packages/llm/src/synthesis.ts`, `packages/llm/src/verifier.ts`.
- Public/gated API split: `apps/web/src/app/api/cards/[slug]/route.ts`, `apps/web/src/app/api/extension/cards/[slug]/route.ts`, `apps/web/src/lib/extension-auth.ts`.
- Generation queue: `apps/web/src/app/api/generate/route.ts`, `apps/web/src/inngest/functions.ts`.
- Persistence: `packages/db/src/schema.ts`, `packages/db/src/repository.ts`.
- UI surfaces: `packages/ui/src/CardShell.tsx`, `packages/ui/src/SynthesisSection.tsx`, `packages/ui/src/SourceDrawer.tsx`, `apps/extension/src/sidepanel.tsx`.

## Questions For Samay

1. Should root-level `INTENT.md` become the agent-facing intent doc, or would you rather this live under `docs/` with a pointer from `AGENTS.md`?

2. Should generation remain explicit-click forever, or is `confirmStart: true` mostly a cost-control guard for v0/local testing?

3. What is the intended slug policy before public launch: keep pretty first-label slugs until collision, or move now to domain-disambiguated slugs such as `foo-ai` / `foo-com`?

4. Should comparables be citation-grade facts with source IDs, or is "provider-derived related companies" acceptable as a looser section?

5. After verifier drops, should gated synthesis render fewer than three bull/bear lines, or should the product show an explicit "not enough verified evidence" state unless exactly three survive?

6. Do you want gated synthesis and verifier drops persisted as first-class rows in `claims`, or is storing them only inside full `cardJson` enough for v0?

7. Are EDGAR, GitHub, and RDAP still v0 retrieval requirements, or are they v1/source-type placeholders?

8. Is the Chrome extension the only intended auth gate for synthesis at launch, or should web-side gated access exist too?

9. Should the first launch audience be "Samay's public build under @semitechievc" or "private investor tool with public card artifacts"? The docs imply the former, but this affects landing copy and launch defaults.

10. Should legal/compliance language be stronger than the current privacy page's "not investment recommendations" sentence before public sharing?

## Agent Operating Principle

When adding features, ask one question first: does this make the card faster, more sourced, more shareable, or more useful to an investor in the activation moment?

If not, it is probably v1. The repo already has enough ambition. The v0 should win by being narrow, cited, and fast.
