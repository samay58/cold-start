# Cold Start Intent

Read this before touching product behavior. `SPEC.md` remains the product source of truth, `DESIGN.md` remains the visual source of truth, and `AGENTS.md` remains the working guide.

## One-Sentence Intent

Cold Start is an investor-grade company context card: click a company website, get sourced fundamentals fast, then choose whether to run deeper investor synthesis behind the Chrome extension.

## Product Thesis

Cold Start competes with old company-intel tiles by matching the basics and beating them on citations, speed, and investor judgment. It should be the thing an investor opens when they need to understand, in seconds, what a company does, who runs it, what is publicly known about funding, what changed recently, and what questions matter next.

The product line is simple. Basics first. Citations always. Judgment only after the public facts hold. A fact without source support is worse than an empty field. A confident-looking uncited card violates the product.

Cold Start is an artifact product, not a chat product. The unit is a stable card at `/c/{slug}`, not a transient answer. The shareable URL matters because one expensive generation can become a reusable public object.

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

Cold Start has two visibility tiers.

The public tier is the shareable web card at `/c/{slug}` plus `/api/cards/{slug}`. It contains sourced public facts only. In the current schema those facts are identity, structured company description, funding, team, recent signals, comparables, and citations. The public API and page must not expose `synthesis`.

The gated tier is the Chrome side panel plus `/api/extension/cards/{slug}`. It returns the full cached card after extension identity and token checks. This is where investor synthesis belongs: why the company might matter, supported claims, and open questions.

The generation path starts from a domain. The intended path is:

```text
domain or active tab
  -> canonical domain and slug
  -> basics request
  -> direct Exa fast fundamentals
  -> StableEnrich / AgentCash fallback and enrichment
  -> evidence ledger
  -> LLM extraction into typed card sections
  -> trust sanitization
  -> partial public card cache
  -> basics-first rendering
  -> user clicks Analyze
  -> analysis retrieval
  -> synthesis and verifier
  -> same card upgraded with gated synthesis
```

## What The Product Is Not

Cold Start is entering the legacy company-intel category. The goal is to make the old shape of that category feel slow and opaque.

It is not a chatbot. Chat may become an interaction later, but the card is the product object.

It is not a contact scraping or outbound automation tool. The privacy page explicitly says it does not scrape contacts, send outbound messages, act as a CRM, or make investment recommendations.

It is not an investment score. The synthesis can frame support and questions, but it should not imply "invest" or "pass."

It is not a generic data dump. The investor lens should name the buyer, workflow, wedge, proof, friction, funding cadence, and what would change the read.

## Load-Bearing Product Decisions

The public/private split is the most important architectural and legal decision. Public surfaces show cited facts. Gated surfaces show synthesis. The code backs this up by storing both `cardJson` and `publicCardJson`, using `publicCard()` before public storage and reads, and keeping `/api/cards/{slug}` on the public repository path.

Citation discipline is not decorative. `ResolvedFact<T>` requires `value`, `status`, `confidence`, and `citationIds`. `sanitizeCardTrust()` nulls facts whose citation IDs are missing or invalid. Signals without valid citations are dropped. `publicCard()` strips synthesis entirely.

Synthesis is optional and must survive verification. The LLM synthesis parser requires visible citation markers to match `citationIds`; the pipeline asks a verifier to mark claims as supported, contradicted, or unsupported; unsupported synthesis is dropped. The implementation intentionally preserves the extracted public card even when synthesis fails.

The extension is an audience filter. `assertExtensionRequest()` requires a bearer token and extension identity or allowed origin, and it fails closed in production if local sentinel values or wildcard extension origins leak in.

Generation is background work. `/api/generate` checks cache and active runs by mode, records a queued generation, and sends an Inngest event. Long-running provider and LLM work belongs in the Inngest function, not the request handler.

Generation has two modes. `basics` starts from the side-panel gate, skips synthesis, and can cache a `partial` public card. The API still permits extension-authenticated basics requests without `confirmStart` as a compatibility allowance, but the product UI should send confirmation after the user clicks Generate profile. Non-extension basics requests need confirmation. `analysis` always requires extension auth plus confirmation and is the only mode that should add supported claims and open questions.

The cache is part of the product economics. The DB stores generated cards with section TTLs: identity 7 days, signals 6 hours, synthesis 24 hours. Code currently stores those expirations, though partial section regeneration is not fully implemented.

## Trust Model

Cold Start should earn trust through structure, not tone.

### Facts

- A fact with no valid citation becomes `unknown`, not a pretty guess.
- Missing facts render as not publicly disclosed or empty states.
- Public web sources can support `status: verified` when the cited source actually contains the claim.
- Vendor-only facts can display with vendor source context, but they stay `status: inferred` with lower confidence unless corroborated.
- Funding totals, valuations, and headcount stay downgraded on single-source evidence.
- Funding totals require explicit support or a reconciled round ledger.
- Source quality matters. Independent technical and analysis sources carry more judgment weight than press releases or enrichment data.
- Conflicts should become `mixed`, not averaged away.

### Synthesis

- Synthesis can only use citations already on the card.
- Why-it-matters and every synthesis line must include visible citation markers.
- The pipeline strips or rejects forbidden hedge phrases such as "reportedly" and "appears to be."
- If the verifier cannot support the lede, the entire synthesis block is removed.
- The public route must never leak synthesis.

### Design

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
- Supported claims.
- Open questions.

The description model is especially important. It is not a slogan field. It tries to capture what the company does, the non-obvious product concept, who it serves, and how the mechanism works.

## Architecture Intent

The monorepo boundaries are meaningful:

- `packages/core` owns schema, slugging, trust rules, source quality, and public redaction. It should stay free of DB, network, and provider dependencies.
- `packages/db` owns Drizzle schema, repository reads/writes, public/full card persistence, generation runs, claims, citations, and sources.
- `packages/providers` owns direct Exa fundamentals, AgentCash, StableEnrich calls, and fallback configuration scaffolding.
- `packages/llm` owns Anthropic client setup, research planning, extraction tool schemas, synthesis tool schemas, and verifier parsing.
- `packages/pipeline` owns orchestration across providers, evidence ledger construction, extraction, synthesis, verification, and final sanitization.
- `packages/ui` owns presentational card rendering. It receives a card and should not fetch data.
- `apps/web` owns public pages, APIs, generation queueing, Inngest serving, and auth gating.
- `apps/extension` owns active-tab capture, settings, cache fetch, explicit basics start, explicit analysis start, polling, and side-panel rendering.

The cleanest mental model is that core defines a valid card, pipeline creates one, db stores both full and public versions, and web plus extension choose which version to show.

## Retrieval And LLM Intent

The retrieval layer should answer investor questions, not just fill fields. It must also cover the basics without making the user wait for a full memo pipeline.

The current provider path starts with direct Exa for fast fundamentals:

- Direct Exa company search for company profile and domain identity.
- Direct Exa people search for founders, executives, and management team.
- Direct Exa news search for funding history and recent signals.

StableEnrich through AgentCash remains the fallback and enrichment path:

- Exa search for funding history, company profile, and independent analysis.
- Exa findSimilar for comparables.
- Firecrawl scrape of homepage.
- Apollo org enrichment.

The spec also talks about EDGAR, GitHub, and RDAP, but the code currently centers on direct Exa plus StableEnrich. Treat the other source types as intended extension points unless they are implemented later.

The LLM should be treated as a structured extractor and cautious synthesizer. It should not freewrite the card. Tool schemas, zod parsing, citation validation, and unsupported-claim drops are the product's guardrails.

## UX And Brand Intent

The current visual system is an editorial company dossier with instrument-grade source encoding. The app is light-first: warm parchment surfaces, black ink, sand hairlines, Fraunces for document emphasis, Mona Sans for operational UI, and Lens Blue for citations and active states.

This should not become a generic dark dashboard or a generic AI SaaS panel. Older Paper-era dark-shell and Berkeley/IBM directions are archived; use `DESIGN.md` as the current app truth before generating mockups or changing UI.

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
- The side panel first checks for a cached full card. If missing, it shows a Generate profile gate, starts `basics` after confirmation, and then polls.
- The Analyze button starts `analysis` with confirmation and extension auth.
- `generation_runs` tracks `basics` and `analysis` independently through a `mode` column.
- Production extension auth rejects wildcard Chrome origins, localhost origins, local extension IDs, and the local token sentinel.

## Current Gaps

These are places where docs, code, or product intent do not fully line up yet.

- Slugs are currently the first hostname label, so `foo.com` and `foo.ai` collide as `foo`. The spec mentions domain disambiguation, but the implementation has not solved it.
- `cacheStatus: "partial"` now covers a basics-first card without synthesis, but partial section regeneration is not implemented as a complete behavior.
- DB schema has `claim_visibility = public | gated`, but `recordCardEvidence()` currently records public claims only.
- The spec mentions EDGAR, GitHub, and RDAP source paths. The current provider implementation does not fetch them.
- The pipeline exposes `generationCostUsd`, but the Inngest path does not pass live provider/LLM cost lines, so observed costs may remain `0` until cost accounting is wired.
- Direct Exa is wired for fast fundamentals, but the exact production latency and coverage targets still need golden-set measurement.
- The synthesis parser still accepts compatibility fields that post-verification filtering may leave empty. The UI can render fewer supported lines or empty states.
- Comparables do not carry citation IDs in the current card schema. They come from provider output but are not inspectable at the same claim level as facts.
- `claims` stores only selected public fact paths. Signals, comparables, gated synthesis, unsupported-claim drops, and source failures are not represented as first-class claim/debug rows yet.

## Source Pointers

Read these files when validating or changing intent-critical behavior:

- Product truth: `README.md`, `SPEC.md`, `DESIGN.md`.
- Agent working context: `AGENTS.md`.
- Card schema and redaction: `packages/core/src/card.ts`, `packages/core/src/trust.ts`.
- Source incentives: `packages/core/src/source-quality.ts`.
- Pipeline assembly: `packages/pipeline/src/generate-card.ts`, `packages/pipeline/src/evidence-ledger.ts`.
- Retrieval: `packages/providers/src/direct-exa.ts`, `packages/providers/src/stableenrich.ts`, `packages/providers/src/agentcash.ts`.
- LLM behavior: `packages/llm/src/investor-taste-kernel.ts`, `packages/llm/src/research-plan.ts`, `packages/llm/src/extraction.ts`, `packages/llm/src/synthesis.ts`, `packages/llm/src/verifier.ts`.
- Public/gated API split: `apps/web/src/app/api/cards/[slug]/route.ts`, `apps/web/src/app/api/extension/cards/[slug]/route.ts`, `apps/web/src/lib/extension-auth.ts`.
- Generation queue: `apps/web/src/app/api/generate/route.ts`, `apps/web/src/inngest/functions.ts`.
- Persistence: `packages/db/src/schema.ts`, `packages/db/src/repository.ts`.
- UI surfaces: `packages/ui/src/CardShell.tsx`, `packages/ui/src/SynthesisSection.tsx`, `packages/ui/src/SourceDrawer.tsx`, `apps/extension/src/sidepanel.tsx`.

## Questions For Samay

1. Should root-level `INTENT.md` become the agent-facing intent doc, or would you rather this live under `docs/` with a pointer from `AGENTS.md`?

2. What is the exact paid-data boundary for funding history after the basics sprint: stay on public web plus enrichment, license Crunchbase, or evaluate another vendor once coverage data proves the gap?

3. What is the intended slug policy before public launch: keep pretty first-label slugs until collision, or move now to domain-disambiguated slugs such as `foo-ai` / `foo-com`?

4. Should comparables be citation-grade facts with source IDs, or is "provider-derived related companies" acceptable as a looser section?

5. After unsupported synthesis drops, should the product render fewer supported lines, or should it show an explicit "not enough verified evidence" state unless enough survive?

6. Do you want gated synthesis and unsupported-claim drops persisted as first-class rows in `claims`, or is storing them only inside full `cardJson` enough for v0?

7. Are EDGAR, GitHub, and RDAP still v0 retrieval requirements, or are they v1/source-type placeholders after fast fundamentals lands?

8. Is the Chrome extension the only intended auth gate for synthesis at launch, or should web-side gated access exist too?

9. Should the first launch audience be "Samay's public build under @semitechievc" or "private investor tool with public card artifacts"? The docs imply the former, but this affects landing copy and launch defaults.

10. Should legal/compliance language be stronger than the current privacy page's "not investment recommendations" sentence before public sharing?

## Agent Operating Principle

When adding features, ask whether the change makes the card faster, more sourced, more shareable, or more useful to an investor in the activation moment.

If not, it is probably v1. The repo already has enough ambition. The v0 should win by being narrow, cited, and fast.
