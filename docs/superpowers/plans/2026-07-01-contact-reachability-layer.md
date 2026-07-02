# Contact Reachability Layer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`) syntax. On approval, also copy this plan to `docs/superpowers/plans/2026-07-01-contact-reachability-layer.md` (plan mode restricts writes to this file only right now).

## Context

Cold Start needs contact data to be a real venture-research tool, but paying ZoomInfo/Apollo/PitchBook is off the table and the current Websets path costs ~$0.28 median per basics run (85% of basics COGS). A read-only proof on 2026-07-01 (`docs/product/contact-enrichment-yield-and-design-2026-07-01.md`) showed that **74% of target-type companies (37/50) expose a real human `@company-domain` email in public GitHub commits**, and that email reveals the domain's people-pattern (`first.last` or `first`). That pattern, applied to founders/execs already extracted during basics, yields work emails at near-zero marginal cost for exactly the venture-stage technical companies the incumbents cover worst.

This plan builds that free "reachable identity" layer: harvest public GitHub commit emails, derive the domain email pattern, infer founder/exec work emails labeled honestly as observed vs inferred, and add per-person public channels (GitHub/X/personal). It keeps Cold Start's trust model intact (inferred emails carry a provenance label and never leak to the public card) and repoints the paid Websets path to an explicit, user-triggered "deep contact find" for the ~26% miss.

Intended outcome: contact value on ~3 of 4 target companies for ~$0.00, default basics COGS back near the $0.04 floor, and all paid contact spend user-triggered.

**Decisions locked (2026-07-01):** Websets = manual deep-find only (never auto-runs; user triggers it on the Lens). Public channels = extension-only for v1 (public `/c/{slug}` card unchanged). Email inference is deterministic pipeline code, NOT LLM prompting — the extractor's "do not guess emails" guidance stays unchanged.

## Global Constraints

- **Trust invariant:** person emails must never reach the anonymous public surface. The single protection is `publicCard()` → `stripPersonEmails()` in `packages/core/src/trust.ts:197-223`. Any new email-adjacent field must be stripped there too, and a test must assert it.
- **Inferred emails must be visibly distinguishable from observed ones** everywhere they render. A pattern-constructed email labeled the same as a real one violates the honesty model.
- **No personal emails.** Only surface `@company-domain` work emails (observed or inferred). Personal Gmail/iCloud addresses seen in commits are not surfaced. This preserves the "does not collect personal emails" privacy commitment.
- **Email inference is code, not prompt.** Do not relax `packages/llm/src/extraction.ts:802,834` ("Do not guess email patterns"). The LLM stays disciplined; inference happens deterministically in the pipeline with explicit labels.
- **No DB migration:** a person lives inside `team.founders`/`team.keyExecs` JSONB in `cards.card_json`. Schema changes are zod-only.
- **API contract:** any person-shape change on the extension bootstrap/card routes requires bumping `packages/core/api-contract.json` and rebuilding the extension.
- **CSS:** extension styling routes every color through theme tokens; `npm run audit:css -w @cold-start/extension` fails on raw color literals.
- **Gate:** `npm run check` must pass (lint zero-warnings, typecheck, tests, build, golden dry-run, knip, secrets, audit:deps). `audit:deps` has known pre-existing advisories; clean-through-secrets counts as pass.
- **GitHub auth:** production needs `GITHUB_TOKEN` (PAT) for 5,000 req/hr. The harvester must degrade gracefully (skip, never throw) when the token is absent.

## Architecture

Two new units plus wiring. (1) A pure, dependency-light **email-pattern engine** in `packages/core` (derive pattern from observed anchors, apply pattern to a name, classify role-alias vs human local-parts). (2) A free **GitHub contacts provider** in `packages/providers` modeled on `sec-edgar.ts` (injectable fetcher, result-or-failure union, own zero-cost trace node). Wiring runs both inside the existing basics contact-enrichment worker (`apps/web/src/inngest/contact-enrichment.ts`) BEFORE the paid path, emits `team.founders`/`team.keyExecs` `ProviderFactCandidate`s (observed emails direct by name-match, inferred emails via pattern) that flow through the existing `applyProviderFactCandidates` merge, and repoints Websets behind an explicit trigger. The extension renders the observed/inferred label and channel links.

## Tech Stack

TypeScript, zod (core schema), Anthropic tool JSON-schema (extractor), Inngest workers, GitHub REST API via injectable `fetch`, Vitest (unit), jsdom + React `createRoot` (extension), tsx (scripts).

## File Structure

- Create `packages/core/src/email-pattern.ts` — pure engine (no network/DB). Export from `packages/core/src/index.ts`.
- Create `packages/core/tests/email-pattern.test.ts`.
- Modify `packages/core/src/card.ts:50-55` — `personSchema` gains `githubUrl`, `xUrl`, `personalUrl`, `emailStatus`.
- Modify `packages/core/src/trust.ts:211-223` — `stripPersonEmails` also strips `emailStatus`.
- Create `packages/providers/src/github-contacts.ts` — org resolve + commit-email harvest (template: `packages/providers/src/sec-edgar.ts`). Export from `packages/providers/src/index.ts`.
- Create `packages/providers/tests/github-contacts.test.ts`.
- Modify `packages/providers/src/types.ts:124` — add `"github"` to `ProviderFactCandidate.provider`.
- Modify `packages/core/src/generation-trace.ts` — add `providers.github` trace node (mirror `providers.directExa` at `:122-131`).
- Modify `packages/llm/src/extraction.ts:109-119,700-720` — person JSON-schema + normalizer gain the three channel URLs (extraction of channels from sources is honest; emails stay unchanged).
- Modify `packages/pipeline/src/provider-facts.ts:65-72` and `packages/pipeline/src/generate-card.ts:309-316,342` — `mergePerson` carries the new fields; change-detection includes them.
- Modify `apps/web/src/inngest/contact-enrichment.ts` — run GitHub path first; repoint Websets behind an explicit trigger; emit `providers.github` trace.
- Modify `apps/web/src/inngest/env.ts` + `README.md` + `SECURITY.md` — `GITHUB_TOKEN`.
- Modify `apps/extension/src/CompanyHeader.tsx:237-247,265-276,372-465` + `apps/extension/src/styles.css` — observed/inferred label + channel links; remove the dead duplicate in `ResearchLayerPanel.tsx:436-696`.
- Modify `packages/core/api-contract.json` — bump version.
- Create `scripts/measure-contact-yield.ts` — founder-direct-hit measurement (read-only).
- Update docs: `INTENT.md`, `apps/web/src/app/privacy/page.tsx`, `docs/product/alpha-packaging-spec-2026-07-01.md` pointer.

---

## Task 1: Email-pattern engine (core, pure, TDD)

**Files:** Create `packages/core/src/email-pattern.ts`, `packages/core/tests/email-pattern.test.ts`; modify `packages/core/src/index.ts`.

**Produces (signatures later tasks rely on):**
```ts
export type EmailPattern = "first.last" | "first" | "flast" | "f.last" | "firstlast";
export function isRoleAlias(localPart: string): boolean;
export function deriveEmailPattern(anchors: { email: string; fullName: string | null }[]): EmailPattern | null;
export function applyEmailPattern(pattern: EmailPattern, fullName: string, domain: string): string | null;
```
Logic: `isRoleAlias` matches support/hello/info/contact/hi/hiring/join/jobs/careers/press/sales/help/dev/developers/team/admin/noreply/git/svc/github/security/billing/legal/privacy/abuse/postmaster/marketing/events/community/feedback/notifications/publisher/automation/service/accounts/circleci/bot/build/release/infra/ops/it/hr/finance (anchored, with `[+._-]|$` boundary). `deriveEmailPattern` only considers non-role anchors whose local part is reconstructible from the committer's name (ASCII-fold diacritics, strip non-letters, lowercase); it picks the majority pattern and returns null on no confident match. `applyEmailPattern` folds the name the same way and returns null for single-token names when the pattern needs two.

- [ ] **Step 1: Write failing tests.** Cover: `deriveEmailPattern([{email:"noah.tye@x.ai",fullName:"Noah Tye"}])` → `"first.last"`; `[{email:"charles@x.com",fullName:"Charles Frye"}]` → `"first"`; `[{email:"cimhoff@x.tech",fullName:"Chris Imhoff"}]` → `"flast"`; role-alias-only anchors (`support@`, `hello@`) → `null`; `applyEmailPattern("first.last","María O'Neil","x.ai")` → `"maria.oneil@x.ai"`; `applyEmailPattern("first.last","Cher","x.ai")` → `null`; `isRoleAlias("support")`/`isRoleAlias("hiring")` → true, `isRoleAlias("noah.tye")` → false.
- [ ] **Step 2: Run, verify fail** (`npm test -w @cold-start/core -- email-pattern`; expect "not a function"/module-not-found).
- [ ] **Step 3: Implement `email-pattern.ts`** with the four exports; add re-export line to `packages/core/src/index.ts`.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** (`feat(core): email-pattern inference engine`).

## Task 2: personSchema fields + public-strip + extractor contract

**Files:** `packages/core/src/card.ts:50-55`; `packages/core/src/trust.ts:211-223`; `packages/llm/src/extraction.ts:109-119,700-720`; `packages/core/api-contract.json`; tests in `packages/core/tests/trust.test.ts` (mirror `card-quality.test.ts:14-62` helpers).

**Consumes:** none. **Produces:** `personSchema` with `githubUrl`, `xUrl`, `personalUrl` (`z.string().url().nullable().optional()`) and `emailStatus` (`z.enum(["observed","inferred"]).nullable().optional()`).

- [ ] **Step 1: Failing test** in `trust.test.ts`: build a card whose `team.founders.value[0]` has `email:"a@x.ai"`, `emailStatus:"inferred"`, `githubUrl:"https://github.com/a"`; assert `publicCard(card).team.founders.value[0]` has no `email` and no `emailStatus`, but still has `githubUrl`.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement.** Add the four fields to `personSchema` (`card.ts:50-55`). In `stripPersonEmails` (`trust.ts:219`) destructure both: `const { email: _e, emailStatus: _s, ...publicPerson } = person;`. Add the three channel URLs (not email) to `personValueSchema` properties + `required` (`extraction.ts:111-118`) and to `normalizePersonArray` (`extraction.ts:712-717`); leave email guidance at `:802,834` unchanged.
- [ ] **Step 4: Run, verify pass;** run `npm test -w @cold-start/core` and `-w @cold-start/llm`.
- [ ] **Step 5: Bump `api-contract.json`** version (person shape changed) and commit (`feat(core): per-person channels + inferred-email provenance, stripped from public card`).

## Task 3: GitHub contacts provider (providers, network, injectable fetcher)

**Files:** Create `packages/providers/src/github-contacts.ts`, `packages/providers/tests/github-contacts.test.ts`; modify `packages/providers/src/types.ts:124`, `packages/providers/src/index.ts`.

**Consumes:** `deriveEmailPattern`, `isRoleAlias` from Task 1. **Produces:**
```ts
export type GithubContactsResult = {
  found: true; org: string;
  observed: { email: string; fullName: string | null }[];   // real @domain human commit emails
  pattern: import("@cold-start/core").EmailPattern | null;
  sources: ProviderSource[];                                  // sourceType:"github"
  trace: { org: string | null; reposChecked: number; requestCount: number; estimatedCostUsd: 0 };
};
export type GithubContactsFailure = { found: false; reason: string; trace: {...; estimatedCostUsd: 0} };
export function fetchGithubContacts(input: {
  domain: string; companyName: string; fetcher?: FetchLike; token?: string;
}): Promise<GithubContactsResult | GithubContactsFailure>;
```
Behavior (mirror `sec-edgar.ts` structure): resolve org by login guesses against `/users/{login}` confirmed by website-host == registrable(domain), one `/search/users` fallback; list top repos by stars via `/orgs|/users/{login}/repos`; pull `/repos/{o}/{r}/commits?per_page=100` for the top ~4; collect `commit.author.email`+`name`; drop `*noreply*`; keep `@domain` addresses; split human (`!isRoleAlias`) vs role; call `deriveEmailPattern` on human anchors. Injectable `fetcher` default global `fetch`; send `Authorization: Bearer ${token}` when present; on any error/absent-token return `found:false` (never throw). Add `"github"` to `ProviderFactCandidate.provider` (types.ts:124).

- [ ] **Step 1: Failing test** with a mock `fetcher` returning canned org/repos/commits JSON (one `@domain` human commit `noah.tye@x.ai`/"Noah Tye", one `support@x.ai`, one `x@users.noreply.github.com`). Assert result `observed` contains only the human `@domain` email, `pattern === "first.last"`, `sources[0].sourceType === "github"`, and a missing-org mock returns `found:false` without throwing.
- [ ] **Step 2: Run, verify fail** (`npm test -w @cold-start/providers -- github-contacts`).
- [ ] **Step 3: Implement** `github-contacts.ts` + provider-union edit + index export.
- [ ] **Step 4: Run, verify pass;** `npm run typecheck -w @cold-start/providers`.
- [ ] **Step 5: Commit** (`feat(providers): free GitHub commit-email harvester + pattern anchor`).

## Task 4: Pipeline merge carries new fields + GitHub trace node

**Files:** `packages/pipeline/src/provider-facts.ts:65-72`; `packages/pipeline/src/generate-card.ts:309-316,342`; `packages/core/src/generation-trace.ts`; tests in `packages/pipeline/tests/provider-facts.test.ts`.

**Consumes:** Task 2 fields. **Produces:** `mergePerson` in both files copies `githubUrl`/`xUrl`/`personalUrl`/`emailStatus` (email-carrying spread pattern at provider-facts.ts:70 extended); `generate-card.ts:342` change-detection compares them; `providers.github` optional node on the trace (`{ org, reposChecked, requestCount, estimatedCostUsd }`) mirroring `providers.directExa` (generation-trace.ts:122-131).

- [ ] **Step 1: Failing test** in `provider-facts.test.ts`: apply a `team.founders` `ProviderFactCandidate` whose person has `email:"a@x.ai",emailStatus:"inferred",githubUrl:"..."`; assert the merged card person retains all three; assert a later observed email for the same person upgrades `emailStatus` to `"observed"` and does not drop the channel.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** both `mergePerson` edits, the change-detection line, and the trace node. Merge rule: `observed` beats `inferred` when both present for one person.
- [ ] **Step 4: Run, verify pass;** `npm test -w @cold-start/pipeline` and `-w @cold-start/core`.
- [ ] **Step 5: Commit** (`feat(pipeline): carry person channels + email provenance through merge`).

## Task 5: Wire GitHub-first into the contact worker; env; docs

**Files:** `apps/web/src/inngest/contact-enrichment.ts` (people-hints `:129-151`, worker body `:266+`, Websets gate `:373`); `apps/web/src/inngest/env.ts`; `README.md`; `SECURITY.md`.

**Consumes:** Tasks 1, 3, 4. **Produces:** a `github-contacts` step run BEFORE the paid email path that builds `team.founders`/`team.keyExecs` `ProviderFactCandidate`s: observed `@domain` emails direct-matched by name to extracted people (`emailStatus:"observed"`), and inferred emails for the remaining named founders/execs via `applyEmailPattern` (`emailStatus:"inferred"`, `status:"inferred"`, `confidence:"low"`, `sourceType:"github"`, person `sourceUrl` = the anchor commit/source URL). Merge via existing `applyProviderFactCandidates`. Emit `trace.providers.github`. **Websets is repointed to explicit trigger:** the auto-run at `contact-enrichment.ts:373` is gated so it fires only when the request carries an explicit deep-find flag (a new event field, default false), never on the standard basics path. `GITHUB_TOKEN` added to `env.ts` (optional) and documented in `README.md` (API-keys table) and `SECURITY.md` (production secrets list).

- [ ] **Step 1: Failing test.** In the contact-worker test harness (or a focused unit around the new step function), assert: standard basics contact enrichment does NOT call the Websets create/poll path; the GitHub step produces an inferred `@domain` email for an extracted founder with no source email; `publicCard()` on the resulting card strips it.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** the GitHub step + candidate builder, the Websets explicit-trigger gate, env + docs.
- [ ] **Step 4: Run, verify pass;** `npm run typecheck -w @cold-start/web`.
- [ ] **Step 5: Commit** (`feat(web): GitHub-first contact layer; Websets behind explicit deep-find`).

## Task 6: Extension render — observed/inferred label + channels

**Files:** `apps/extension/src/CompanyHeader.tsx:237-247,265-276,372-465`; `apps/extension/src/styles.css`; delete dead `PeopleLine`/`emailKind`/`personTooltipBody` duplicate in `ResearchLayerPanel.tsx:436-696`; test in `apps/extension/tests/` (jsdom, mirror `read-region.test.tsx`).

**Consumes:** Task 2/4 person shape. **Produces:** `PeopleLine` renders an "inferred" affordance (small label/dotted style, tokenized colors) when `person.emailStatus === "inferred"`, a normal cited style when `"observed"`; `personTooltipBody` states the provenance ("Inferred from company email pattern" vs "Found in {host}"); channel icons/links (GitHub/X/personal) render when present. `emailKind` keeps its work/personal/other domain classification and composes with the new provenance.

- [ ] **Step 1: Failing test:** mount `CompanyArc`/`CompanyHeader` with a founder carrying `emailStatus:"inferred"` + `githubUrl`; assert the DOM shows an inferred marker and a GitHub link, and that an `emailStatus:"observed"` founder does not show the inferred marker.
- [ ] **Step 2: Run, verify fail** (`npm test -w @cold-start/extension`).
- [ ] **Step 3: Implement** render + CSS tokens; remove the dead duplicate (knip will confirm).
- [ ] **Step 4: Run, verify pass;** `npm run audit:css -w @cold-start/extension`.
- [ ] **Step 5: Commit** (`feat(extension): show inferred-vs-observed emails + founder channels`).

## Task 7: Founder-direct-hit measurement + docs reconciliation

**Files:** Create `scripts/measure-contact-yield.ts` (read-only, tsx, self-loads env like `measure:first-usable`); add `measure:contact-yield` to root `package.json` scripts; update `INTENT.md` (reachable-identity framing replacing "not a contact scraping tool"), `apps/web/src/app/privacy/page.tsx` (add the provenance paragraph), and the `docs/product/alpha-packaging-spec-2026-07-01.md` contact-policy pointer.

**Consumes:** Task 3 harvester. **Produces:** a command that, over the golden set (and optionally read-only prod cards for extracted teams), reports observed-direct-hit % vs pattern-inferred % vs miss %, so the framing ("likely email + reachable identity" vs "found the founder's inbox") is grounded in data.

- [ ] **Step 1: Implement** the script using `fetchGithubContacts` + `deriveEmailPattern`/`applyEmailPattern`, matching harvested names against each golden company's extracted founders/execs. Print aggregate rates. No writes.
- [ ] **Step 2: Run** `npm run measure:contact-yield` read-only; capture the numbers.
- [ ] **Step 3: Update docs** with the measured founder-direct-hit rate; reconcile INTENT.md + privacy page to the reachable-identity framing; point the packaging spec's contact section here.
- [ ] **Step 4: Run full gate** `npm run check`.
- [ ] **Step 5: Commit** (`chore: contact-yield measurement + reachable-identity doc reconciliation`).

## Verification (end to end)

- **Unit/typecheck/lint/build:** `npm run check` green through secrets (audit:deps pre-existing advisories excepted).
- **Trust invariant (must-pass):** a card with observed + inferred founder emails → `publicCard()` strips `email` and `emailStatus`, keeps channels; the public route `curl -s .../api/cards/{slug} | grep -i email` returns nothing.
- **Free-path behavior:** run a basics generation for a technical company (e.g. `supabase.com`, `modal.com`) locally with `GITHUB_TOKEN` set; confirm `trace.providers.github` is populated, founder emails appear with `emailStatus` observed/inferred, and Websets did NOT run (no `trace.providers.websets`).
- **Explicit deep-find:** trigger the deep-find flag; confirm Websets runs and fills the miss.
- **Extension:** load `apps/extension/dist`, open a technical company; confirm inferred emails render with the inferred marker and channel links, observed emails render normally.
- **Yield reality:** `npm run measure:contact-yield` reproduces the ~74% anchor / pattern-inference rate and reports the founder-direct-hit subset.

## Notes / risks

- GitHub org resolution is the fragile part (false-positive bandwagon orgs). Confirm by website-host match; accept a miss over a wrong org (a wrong org yields no `@domain` anchor, so it fails safe).
- Rate limit: `GITHUB_TOKEN` gives 5,000/hr; without it the harvester skips. Never let it block or slow the basics critical path — run it in its own worker step with a tight timeout, same as other enrichment.
- This ships the contact-tool posture change the user has accepted; INTENT.md and privacy copy are updated in Task 7 so docs and behavior agree.
