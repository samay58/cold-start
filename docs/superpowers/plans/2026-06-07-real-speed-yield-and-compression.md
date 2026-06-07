# Real Speed Yield And Compression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:using-git-worktrees before implementation, then use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Materially reduce time to first useful card and terminal completion by cutting duplicate provider work, no-fact calls, and avoidable LLM input load without weakening source quality, citation integrity, verifier behavior, or public/private boundaries.

**Architecture:** Build this as a measured optimization branch. First add shadow-mode telemetry that proves where time and money are being wasted. Then add two controlled optimizations behind env flags: endpoint yield routing for paid provider fanout, and citation-aware evidence packets for bounded LLM prompts. The first release should default to observe-only unless local tests and trace comparisons show no trust regression.

**Tech Stack:** Next.js 15 App Router, Inngest, Drizzle/Postgres repository layer, StableEnrich and Direct Exa providers, Anthropic extraction and research-section prompts, Vitest, node:test evals, existing trace scripts.

---

## Worktree Strategy

This work must be isolated from the main checkout because it changes provider routing and LLM prompt payloads. It is more likely than the perceived-speed work to create subtle quality regressions.

Recommended branch:

```bash
git worktree add .worktrees/real-speed-yield-compression -b codex/real-speed-yield-compression main
cd .worktrees/real-speed-yield-compression
npm ci
npm run check
```

Precondition: create this from a clean `main` after the current section-run reliability batch is either committed or intentionally excluded.

Rollback path:

```bash
git worktree remove .worktrees/real-speed-yield-compression
git branch -D codex/real-speed-yield-compression
```

No production behavior should change until the env flags are explicitly enabled.

## Product And Reliability Bar

The target is not cheaper traces. The target is faster useful research with the same or better trust outcome. If an optimization causes fewer cited facts, more empty sections, weaker verifier survival, or lower public card quality, it fails even if wall-clock time improves.

Every speed change needs three readings:

- Latency: `seedCardMs`, `firstUsableCardMs`, `analysisReadyMs`, terminal run duration.
- Quality: citation count, structured fact count, visible fact count, section availability, verifier survival.
- Cost: Anthropic cost, AgentCash wallet delta, StableEnrich budgeted endpoint spend.

## Non-Negotiable Constraints

- Verifier behavior cannot be relaxed.
- Unsupported synthesis still gets dropped.
- Public APIs cannot expose synthesis.
- Provider calls cannot be skipped in production until shadow-mode traces prove the skip policy would preserve applied facts.
- Background paid calls require budget ceilings and explicit user/operator confirmation.
- Evidence packets must retain source URLs, citation IDs, source type, snippets, and enough text to audit support.
- No optimization may hide failures from generation traces.

## Files By Responsibility

- Modify `packages/providers/src/provider-budget.ts`: endpoint policy metadata and yield thresholds.
- Modify `packages/providers/src/stableenrich.ts`: shadow skip decisions and later enforced skip decisions.
- Modify `packages/providers/tests/provider-budget.test.ts`: endpoint policy tests.
- Modify `packages/providers/tests/stableenrich.test.ts`: routing and budget tests.
- Modify `packages/core/src/generation-trace.ts`: trace fields for shadow skip decisions and evidence packet stats.
- Modify `apps/web/src/inngest/functions.ts`: collect endpoint yield, emit shadow decisions, use evidence packets behind flags.
- Modify `packages/pipeline/src/provider-facts.ts`: preserve endpoint tags through applied fact traces if needed.
- Modify `packages/pipeline/src/seed-profile.ts`: propagate endpoint fact application to seed card trace.
- Modify `packages/llm/src/extraction.ts`: evidence packet builder and prompt input budgeting.
- Modify `packages/llm/src/research-section.ts`: use packetized evidence for section prompts behind a flag.
- Modify `packages/llm/tests/extraction.test.ts`: packet quality, citation preservation, and budget tests.
- Modify `scripts/trace-generation.ts`: show provider yield, shadow skip decisions, and packet compression stats.
- Modify `scripts/evo-generation-benchmark.ts`: compare speed and quality metrics across modes.
- Modify `docs/qa/generation-trace-and-production-qa.md`: document new trace fields and safe rollout.

## Flags

Add startup env flags:

```text
PROVIDER_YIELD_ROUTER_MODE=off|shadow|enforce
EVIDENCE_PACKET_MODE=off|shadow|prompt
EVIDENCE_PACKET_BUDGET_CHARS=14000
PROVIDER_YIELD_MIN_APPLIED_FACTS=1
PROVIDER_YIELD_MIN_RECENT_RUNS=20
```

Default all behavior-changing flags to `off`. `shadow` records what would have happened without changing provider or LLM behavior. `enforce` and `prompt` are opt-in only.

## Task 1: Baseline Metrics And Trace Display

**Files:**
- Modify: `scripts/trace-generation.ts`
- Modify: `scripts/evo-generation-benchmark.ts`
- Test: existing script tests if present, otherwise add helper tests near pure formatting helpers.

- [ ] **Step 1: Add pure formatting helper tests**

If `scripts/trace-generation.ts` does not expose testable helpers, extract a small helper:

```ts
export function formatLatencyMilestones(trace: GenerationTrace) {
  return {
    seedCardMs: trace.milestones?.seedCardMs ?? null,
    firstUsableCardMs: trace.milestones?.firstUsableCardMs ?? null,
    analysisReadyMs: trace.milestones?.analysisReadyMs ?? null
  };
}
```

Add tests for missing and populated milestones.

- [ ] **Step 2: Add provider yield summary formatting**

Expose a helper:

```ts
export function endpointYieldRows(trace: GenerationTrace) {
  return trace.providers?.stableenrich?.endpoints?.map((endpoint) => ({
    name: endpoint.name,
    status: endpoint.status,
    factCount: endpoint.factCount ?? 0,
    factsAppliedCount: endpoint.factsAppliedCount ?? 0,
    estimatedCostUsd: endpoint.estimatedCostUsd ?? null,
    durationMs: endpoint.durationMs ?? null
  })) ?? [];
}
```

Use existing trace field names where they already exist. If `factsAppliedCount` is not yet typed, add it in Task 2 and keep this helper ready.

- [ ] **Step 3: Update trace detail output**

`npm run trace:generation -- --detail` should show:

- Time to seed card.
- Time to first usable card.
- Time to terminal completion.
- Endpoint produced facts versus applied facts.
- Wallet delta when available.
- Anthropic cost when available.

- [ ] **Step 4: Run tests**

```bash
npm run typecheck
npm test -w @cold-start/core -- generation-quality
```

Expected: typecheck and tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/trace-generation.ts scripts/evo-generation-benchmark.ts packages/core/src/generation-trace.ts
git commit -m "Expose speed and yield trace summaries"
```

## Task 2: Endpoint Applied-Fact Yield

**Files:**
- Modify: `packages/core/src/generation-trace.ts`
- Modify: `packages/pipeline/src/provider-facts.ts`
- Modify: `packages/pipeline/src/seed-profile.ts`
- Modify: `apps/web/src/inngest/functions.ts`
- Test: `packages/pipeline/tests/provider-facts.test.ts`
- Test: `packages/pipeline/tests/generate-card.test.ts`

- [ ] **Step 1: Write failing test for applied endpoint counts**

Add a test named:

```ts
it("counts provider facts by endpoint only when they are applied", () => {
  // Two provider facts arrive from org_enrichment.
  // One is applied to identity.hq.
  // One is ignored because the cited card fact is stronger.
  // Expected: candidateCount is 2, appliedCount is 1, appliedByEndpoint.org_enrichment is 1.
});
```

- [ ] **Step 2: Ensure provider facts carry endpoint tags**

Every `ProviderFactCandidate` used in merge traces must retain:

```ts
{
  provider: "stableenrich" | "direct-exa" | string;
  endpoint: string;
}
```

If the type already supports this, do not rename it. Add normalization only where a provider currently omits the endpoint.

- [ ] **Step 3: Add `factsAppliedCount` to endpoint trace**

In `packages/core/src/generation-trace.ts`, add optional field:

```ts
factsAppliedCount: z.number().int().nonnegative().optional()
```

Keep it optional for old traces.

- [ ] **Step 4: Merge applied counts into StableEnrich endpoint traces**

Use the already present `applyStableenrichEndpointYield` path in [functions.ts](/Users/samaydhawan/Projects/active/cold-start/apps/web/src/inngest/functions.ts:487). It should write `factsAppliedCount` per endpoint without changing provider calls.

- [ ] **Step 5: Run tests**

```bash
npm test -w @cold-start/pipeline -- provider-facts generate-card
npm test -w @cold-start/core -- generation-quality
npm run typecheck
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/generation-trace.ts packages/pipeline/src/provider-facts.ts packages/pipeline/src/seed-profile.ts apps/web/src/inngest/functions.ts packages/pipeline/tests/provider-facts.test.ts packages/pipeline/tests/generate-card.test.ts
git commit -m "Track endpoint applied fact yield"
```

## Task 3: Shadow-Mode Provider Yield Router

**Files:**
- Modify: `packages/providers/src/provider-budget.ts`
- Modify: `packages/providers/src/stableenrich.ts`
- Modify: `apps/web/src/lib/env.ts`
- Modify: `apps/web/src/inngest/functions.ts`
- Test: `packages/providers/tests/provider-budget.test.ts`
- Test: `packages/providers/tests/stableenrich.test.ts`
- Test: `apps/web/tests/generate-route.test.ts`

- [ ] **Step 1: Write failing provider policy tests**

Add tests for:

```ts
it("keeps provider yield router off by default", () => {});
it("records shadow skip decisions without removing requests", () => {});
it("enforces skip decisions only when mode is enforce", () => {});
it("never skips endpoints required by an explicit missing block", () => {});
```

- [ ] **Step 2: Add env parsing**

In `apps/web/src/lib/env.ts`, parse:

```ts
PROVIDER_YIELD_ROUTER_MODE: z.enum(["off", "shadow", "enforce"]).default("off")
PROVIDER_YIELD_MIN_APPLIED_FACTS: z.coerce.number().int().nonnegative().default(1)
PROVIDER_YIELD_MIN_RECENT_RUNS: z.coerce.number().int().positive().default(20)
```

Follow existing env parsing style.

- [ ] **Step 3: Add shadow decision type**

In trace schema:

```ts
providerYieldRouter?: {
  mode: "off" | "shadow" | "enforce";
  decisions: Array<{
    endpoint: string;
    decision: "keep" | "skip";
    reason: string;
    enforced: boolean;
  }>;
}
```

- [ ] **Step 4: Implement static first-pass rules**

Start with deterministic rules that do not require historical DB reads:

- Skip StableEnrich Exa profile if Direct Exa already returned an accepted company profile source.
- Skip StableEnrich funding search if Direct Exa already returned accepted funding source and provider facts include funding total or last round.
- Skip late enrichment probes that do not map to missing blocks, using existing `stableenrichLateEnrichmentSkipsForBlocks`.

In `shadow`, record decisions but keep requests unchanged.

- [ ] **Step 5: Enforce only behind flag**

When mode is `enforce`, pass the skip list into existing StableEnrich request builders. Respect `PER_RUN_AGENTCASH_BUDGET_USD` exactly as today.

- [ ] **Step 6: Run tests**

```bash
npm test -w @cold-start/providers -- provider-budget stableenrich
npm test -w @cold-start/web -- generate-route
npm run typecheck
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add packages/providers/src/provider-budget.ts packages/providers/src/stableenrich.ts apps/web/src/lib/env.ts apps/web/src/inngest/functions.ts packages/providers/tests/provider-budget.test.ts packages/providers/tests/stableenrich.test.ts apps/web/tests/generate-route.test.ts
git commit -m "Add shadow provider yield router"
```

## Task 4: Citation-Aware Evidence Packets In Shadow Mode

**Files:**
- Modify: `packages/llm/src/extraction.ts`
- Modify: `packages/llm/tests/extraction.test.ts`
- Modify: `packages/core/src/generation-trace.ts`
- Modify: `apps/web/src/inngest/functions.ts`

- [ ] **Step 1: Write failing tests for evidence packets**

Add tests:

```ts
it("builds evidence packets with source url, source type, citation text, and support snippets", () => {});
it("keeps filing and independent sources before enrichment sources", () => {});
it("does not drop every snippet from a source with selected citation support", () => {});
it("reports original and packetized character counts", () => {});
```

- [ ] **Step 2: Add packet builder**

In `packages/llm/src/extraction.ts`, add:

```ts
export type EvidencePacket = {
  url: string;
  title: string;
  sourceType: string;
  intents: string[];
  authorityScore: number;
  snippets: string[];
  rawTextPreview: string;
};
```

Build packets from `evidenceLedger` first. Fall back to source text only when ledger coverage is thin.

- [ ] **Step 3: Add packet trace stats**

Trace shape:

```ts
evidencePackets?: {
  mode: "off" | "shadow" | "prompt";
  packetCount: number;
  originalChars: number;
  packetChars: number;
  budgetChars: number;
}
```

In `shadow`, compute stats but still send current prompt input.

- [ ] **Step 4: Run tests**

```bash
npm test -w @cold-start/llm -- extraction
npm test -w @cold-start/core -- generation-quality
npm run typecheck
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/llm/src/extraction.ts packages/llm/tests/extraction.test.ts packages/core/src/generation-trace.ts apps/web/src/inngest/functions.ts
git commit -m "Add shadow evidence packet telemetry"
```

## Task 5: Evidence Packets In Prompt Mode

**Files:**
- Modify: `packages/llm/src/extraction.ts`
- Modify: `packages/llm/src/research-section.ts`
- Modify: `packages/llm/tests/extraction.test.ts`
- Modify: `packages/llm/tests/research-section.test.ts`
- Modify: `apps/web/src/lib/env.ts`
- Modify: `apps/web/src/inngest/functions.ts`

- [ ] **Step 1: Write failing prompt-mode tests**

Tests must prove:

- `EVIDENCE_PACKET_MODE=off` preserves current prompt shape.
- `EVIDENCE_PACKET_MODE=shadow` preserves current prompt shape and records stats.
- `EVIDENCE_PACKET_MODE=prompt` sends packets plus bounded raw previews.
- Citation IDs in extraction output still resolve to top-level citations.

- [ ] **Step 2: Add env parsing**

```ts
EVIDENCE_PACKET_MODE: z.enum(["off", "shadow", "prompt"]).default("off")
EVIDENCE_PACKET_BUDGET_CHARS: z.coerce.number().int().positive().default(14000)
```

- [ ] **Step 3: Use packets in extraction prompts only when enabled**

When `prompt` mode is enabled, `evidenceForExtractionPrompt` should include:

```ts
{
  domain,
  researchPlan,
  evidencePackets,
  sources: boundedRawPreviews
}
```

Keep enough raw source preview for auditability. Do not send packets without source URLs.

- [ ] **Step 4: Apply the same pattern to research sections**

`synthesizeResearchSection` should use packetized evidence only in `prompt` mode and only from stored public evidence. Gated output stays gated.

- [ ] **Step 5: Run tests**

```bash
npm test -w @cold-start/llm -- extraction research-section
npm test -w @cold-start/pipeline -- generate-card
npm run verify:cache-ttl
npm run typecheck
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add packages/llm/src/extraction.ts packages/llm/src/research-section.ts packages/llm/tests/extraction.test.ts packages/llm/tests/research-section.test.ts apps/web/src/lib/env.ts apps/web/src/inngest/functions.ts
git commit -m "Gate evidence packet prompts behind env flag"
```

## Task 6: Shadow Benchmark Harness

**Files:**
- Modify: `scripts/evo-generation-benchmark.ts`
- Create: `docs/qa/real-speed-shadow-benchmark.md`
- Test: existing eval tests under `eval/`

- [ ] **Step 1: Add benchmark comparison modes**

Benchmark should support:

```bash
npm run evo:generation-benchmark -- --mode baseline --limit 12
npm run evo:generation-benchmark -- --mode provider-shadow --limit 12
npm run evo:generation-benchmark -- --mode packet-shadow --limit 12
```

No mode should trigger paid calls unless the existing generation path would already do so and env budgets allow it.

- [ ] **Step 2: Add output metrics**

For each run, report:

- First usable card ms.
- Terminal duration ms.
- Citation count.
- Structured fact count.
- Visible fact count.
- Available public section count.
- Synthesis verifier survival count when analysis is run.
- AgentCash wallet delta.
- Anthropic cost.

- [ ] **Step 3: Write QA doc**

Create `docs/qa/real-speed-shadow-benchmark.md` with:

- How to run baseline.
- How to run shadow provider router.
- How to run packet shadow.
- What counts as pass or fail.
- Explicit warning that live paid provider runs require operator approval and budget env vars.

- [ ] **Step 4: Run dry gates**

```bash
npm run eval:golden -- --dry-run --limit 12
npm run check
```

Expected: full gate passes.

- [ ] **Step 5: Commit**

```bash
git add scripts/evo-generation-benchmark.ts docs/qa/real-speed-shadow-benchmark.md
git commit -m "Add real speed shadow benchmark guide"
```

## Task 7: Manual Real-Run Acceptance

**Files:**
- Modify: `docs/qa/real-speed-shadow-benchmark.md`
- No code changes unless real-run evidence reveals a bug.

- [ ] **Step 1: Pick three companies**

Use one easy, one medium, and one hard target:

```text
cartesia.ai
modal.com
turbopuffer.com
```

- [ ] **Step 2: Run baseline with strict budget**

```bash
set -a
source .env.local
set +a
PROVIDER_YIELD_ROUTER_MODE=off EVIDENCE_PACKET_MODE=off PER_RUN_AGENTCASH_BUDGET_USD=0.30 npm run qa:generation -- --domain cartesia.ai
```

Repeat only with explicit approval for other companies because provider calls may cost money.

- [ ] **Step 3: Run shadow modes**

```bash
PROVIDER_YIELD_ROUTER_MODE=shadow EVIDENCE_PACKET_MODE=shadow PER_RUN_AGENTCASH_BUDGET_USD=0.30 npm run qa:generation -- --domain cartesia.ai
```

- [ ] **Step 4: Compare**

Pass if:

- Citation count does not fall by more than 10 percent.
- No public/private leak appears.
- No verifier relaxation occurs.
- `firstUsableCardMs` improves or shadow data identifies a clear enforced-skip candidate.
- Terminal duration does not regress by more than 10 percent.

- [ ] **Step 5: Record findings**

Append a short dated section to `docs/qa/real-speed-shadow-benchmark.md`:

```markdown
## 2026-06-07 Shadow Run Notes

Domain:
Mode:
First usable card:
Terminal duration:
Citations:
Applied endpoint changes:
Decision:
```

- [ ] **Step 6: Commit notes**

```bash
git add docs/qa/real-speed-shadow-benchmark.md
git commit -m "Record real speed shadow run notes"
```

## Merge Gate

- [ ] Default behavior remains unchanged with `PROVIDER_YIELD_ROUTER_MODE=off` and `EVIDENCE_PACKET_MODE=off`.
- [ ] `npm run check` passes.
- [ ] Provider and LLM focused tests pass.
- [ ] Public route tests prove no synthesis leak.
- [ ] Extension bootstrap tests prove contract compatibility.
- [ ] Shadow traces show what would be skipped before any enforce rollout.
- [ ] Prompt packet mode proves citation references still resolve.
- [ ] Live paid runs, if performed, use explicit budget env vars and record wallet deltas.
- [ ] Any production rollout starts with `shadow`, not `enforce` or `prompt`.

## Rollout Recommendation

Ship in three phases:

1. Merge trace display and shadow-mode telemetry only.
2. Enable `PROVIDER_YIELD_ROUTER_MODE=shadow` locally and in internal staging-like runs.
3. Consider `enforce` or `prompt` only after at least 20 comparable runs show no quality regression.

Do not bundle this with the living dossier branch. Perceived-speed wins can ship earlier and give users value while real-speed work earns its way in through evidence.
