# Contact enrichment: free-signal yield proof and design

Date: 2026-07-01
Status: proposed, proof-backed
Owner: Samay
Relates to: `docs/product/alpha-packaging-spec-2026-07-01.md` (reconciles the contact-policy section there), `docs/product/unit-economics-trace-analysis-2026-06-23.md`, `docs/product/research/cost-quality-optimization-playbook-2026-06-23.md`, `INTENT.md`.

## The question

Can Cold Start get investor-useful contact data without paying ZoomInfo, Apollo, or the current Websets path (~$0.28 median per basics run), so contact value is not the thing that either breaks the unit economics or forces a "not a contact tool" retreat?

## The proof

Measured read-only on 2026-07-01 against the 50-company golden set, which mirrors Cold Start's real target mix (dev-tools, AI infra, data, fintech). Method: resolve each company's public GitHub org, mine author emails from the top few repos' recent commits via the official GitHub API (free, 5,000 req/hr on a normal PAT), classify each email as GitHub-noreply, role alias (`support@`, `hello@`), or a real human `@company-domain` address, and DNS-fingerprint each mail provider. No paid calls. No LinkedIn. No scraping outside GitHub's public API.

| Signal | Rate | What it gives you |
|---|---:|---|
| Confirmable public GitHub org | ~46/50 | Entry point; the 4 hard misses are non-technical (fintech, legal, travel) |
| >=1 real human `@domain` commit email | **37/50 (74%)** | A real named contact **and** the domain's people-pattern |
| Domain people-pattern is `first.last` or `first` | 37/37 | Simple, inferable; mix was 16 `first.last`, 21 `first` |
| Mail provider is Google Workspace | 45/50 (90%) | Determines the verification strategy (see design) |

The 74% is a floor. At least three of the thirteen misses (Together AI, Pinecone, Chroma) were my own org-resolution errors during measurement, not true absence of signal; correcting them pushes the real rate for this company type toward ~80%.

Coverage is category-shaped, and the shape is favorable:

| Strong (near-total) | Thin |
|---|---|
| AI infra, dev tools, data, ML labs, databases, vector DBs | consumer AI, some fintech, legal AI, travel, GTM |

That is exactly the wedge from the last discussion: the companies where free public signal is rich are the venture-stage technical companies the incumbents cover *worst*. Cold Start wins depth where PitchBook and ZoomInfo are stale, and honestly declines where they are strong.

### What the proof does and does not establish

- Establishes: for ~3 in 4 target companies, one free API path yields a real work email and the domain's email pattern.
- Establishes: the pattern is trivial (`first.last` / `first`), so given a founder's name (which basics already extracts) you can construct that founder's likely email at near-zero cost.
- Does **not** establish: that the harvested human email always belongs to a *founder or exec* specifically. Many committers are engineers. The founder-direct-hit rate (commit email that maps by name to an extracted founder) is a subset I did not measure and would measure during the build. This does not weaken the plan, because pattern inference produces the founder's email from their name regardless of whether they personally committed.
- Does **not** establish: verification. See below on why that is fine.

Raw per-company results (including harvested addresses) stay in local scratchpad and are deliberately not committed; this doc keeps aggregates and generic pattern facts only, since the raw rows contain real personal email addresses.

## Measured through the shipped code (2026-07-02)

The proof above used a spike with hand-corrected org logins. `npm run measure:contact-yield` now runs the same provider the pipeline ships (`fetchGithubContacts`) over the golden set, so it reflects real behavior:

| Metric (shipped provider, n=50) | Rate |
|---|---:|
| GitHub org resolved | 50/50 |
| >=1 human `@domain` anchor | 30/50 (60%) |
| domain email pattern derived | 29/50 (58%) |

The shipped rate (~58-60%) is below the spike's 74% for one reason: the runtime org resolver (login guesses + one confirmed search fallback) misses orgs the spike resolved by hand (`snowflakedb`, `modal-labs`, `tryretool`, `hex-inc`, and similar non-obvious logins). The 74% is the ceiling with perfect org resolution; the gap is entirely org-resolution quality, not commit-email availability. **The single biggest next improvement is a better org resolver** (a small curated login map for known misses, or a second confirmed search pass). The founder-direct-hit subset (harvested email maps by name to an extracted founder/exec) is reported by the same command when `DATABASE_URL` is set; run it against a read-only prod DB to size it before leaning on the "found the founder's inbox" framing over the "likely email + reachable identity" framing.

## The design call

### Worth building

1. **GitHub org resolver + commit-email harvester.** Resolve the org (login guesses confirmed by website match, one search fallback), pull author emails from the top repos by stars, keep real `@domain` addresses. Free. This is the engine.
2. **Domain-pattern extractor + founder-email inference.** From one human anchor, derive `first.last` or `first`, then construct emails for the founders/execs basics already extracted. Emit them through the existing trust machinery as `status: inferred`, `confidence` low-to-medium, with the citation being the commit/source that established the pattern.
3. **Per-person public channels on `personSchema`.** Add optional `githubUrl`, `xUrl`, `personalUrl` alongside the existing `email` and `sourceUrl`. This is the "reachable identity" reframe: for an investor, the founder's public X plus a sourced context to write a good first line is often more actionable than a raw address, and it is free and ToS-clean.
4. **Websets kept as an explicit, user-triggered "deep contact find."** For the ~26% GitHub miss, or when the user wants a verified email rather than an inferred one, expose it as a deliberate spend on the Investor Lens surface, not a silent default.

### Not worth building

- **SMTP/RCPT verification.** 90% of the set is Google Workspace, which is effectively catch-all and unreliable-to-hostile for RCPT probing, and probing from a server risks blocklisting your sending reputation. Skip it.
- **EDGAR for emails.** EDGAR is a strong free *who* source (officer and director names, already wired via `fetchSecFormD`) but a weak email source. Keep it for names, do not build an email path on it.
- **RDAP / WHOIS for emails.** Mostly privacy-redacted now. Low yield, not worth the code.
- **Chasing breadth into non-technical companies.** Accept the coverage shape. Declining honestly on a consumer brand beats a low-confidence guess.

### Why honesty is the moat here

Cold Start's trust model (`verified / inferred / mixed`, confidence, citations, and `sanitizeCardTrust` nulling unsupported facts) is exactly what makes a cheap inferred email *shippable*. A commit email observed in public source is ground truth for that person. A pattern-inferred email for a founder who did not commit is labeled `inferred` with the basis cited: "inferred from domain pattern first.last; anchor: <committer> in <repo>." A spam tool has to pretend that guess is verified; Cold Start gets to tell the truth about it, and the truth is useful. The hack becomes a feature *because* of the trust machinery, not despite it.

### Cost

| Path | Cost per company | Coverage |
|---|---:|---|
| GitHub harvest + pattern inference | ~$0.00 | ~74% (technical companies near-total) |
| Optional Exa web-search fallback for an anchor | ~$0.01 | recovers some of the miss |
| Optional Hunter verify (already budgeted) on a specific email | ~$0.01 | on demand |
| Websets deep find (explicit) | ~$0.28 | the remainder, when the user asks |

Default contact cost drops from ~$0.28 to roughly free for three quarters of target companies, and the expensive path becomes an intentional, user-visible choice instead of silent default spend.

## The decision this forces (for Samay)

Building this flips a stated posture. `INTENT.md` and the privacy page currently say Cold Start "is not a contact scraping or outbound automation tool" and "does not scrape contacts." Surfacing founder emails, even sourced and inferred, is a contact feature, and Chrome Web Store treats emails as personal data, which raises review scrutiny and disclosure requirements. Two coherent framings:

- **Reachable-identity framing (recommended):** Cold Start surfaces the *people* and their *public professional presence* (GitHub, X, personal site), plus a work email when public commit signal supports it, labeled by confidence and cited. It is not an outbound tool, not a CRM, not a bulk exporter. This stays close to the current positioning while adding the value. The privacy page gains a plain paragraph: work emails may be shown when public source signal supports them, marked as verified or inferred, and are never collected in bulk or used for outbound.
- **Contact-database framing (not recommended):** compete on reachability breadth. This is ZoomInfo's game, loses on coverage, and breaks the defamation-clean public/gated split.

Recommendation: build items 1 through 4 under the reachable-identity framing. It is the version that makes Cold Start meaningfully more useful for venture-stage diligence without becoming the thing INTENT.md says it should not be.

## Reconciliation with the packaging spec

`alpha-packaging-spec-2026-07-01.md` proposed moving Websets contact enrichment to the first Lens run to protect basics COGS. This proof changes that call for the better: the default contact path becomes the free GitHub pattern layer (runs cheaply during basics or Lens without meaningful COGS), and Websets becomes the explicit user-triggered deep-find on the Lens surface. Net effect on the alpha economics: basics stays contact-light and near the $0.04 floor, Lens gains real contact value at near-zero marginal cost for technical companies, and the paid path is spent only on deliberate user intent. Update the packaging spec's contact-enrichment section to point here once this is accepted.

## What would change the call

- **Founder-direct-hit rate comes back low in the build** (few commit emails map to actual founders): the value leans harder on pattern inference and public channels than on observed founder emails; still worth it, but frame it as "likely email" plus "reachable identity," not "we found the founder's inbox."
- **Chrome review flags the email surface:** fall back to public channels only (GitHub, X, site) as the shipped contact layer, keep inferred emails extension-side and clearly labeled, and revisit.
- **Target mix shifts to non-technical companies:** GitHub yield falls with it; the paid deep-find carries more weight and the free layer becomes a bonus rather than the spine.
- **GitHub tightens commit-email exposure or rate limits:** the pattern, once learned per domain, persists; a cached domain-pattern table reduces dependence on live harvesting.

## Suggested build order

1. `personSchema` public-channel fields plus the privacy-page paragraph (small, reversible, ships value even alone).
2. GitHub org resolver + commit-email harvester as a free provider module, wired as a `github`-typed source.
3. Domain-pattern extractor + founder-email inference, emitting `inferred` facts through the trust pass.
4. Repoint the Websets path to an explicit Lens "deep contact find" and update the packaging spec.
5. Measure the founder-direct-hit rate on the golden set during (2) to confirm the framing.
