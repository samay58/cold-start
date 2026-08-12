# Investor Lens Emphasis Read Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the sixth gated Investor Lens category, `emphasisRead`, which reads what a company and its founders are loud about, what never appears in the filed record, and what that asymmetry means; per the approved spec `docs/superpowers/specs/2026-08-11-investor-lens-emphasis-read-design.md`.

**Architecture:** A code-decided thin-file gate runs before anything is paid for. When the file is thick enough, a new memoized Inngest step fetches founder-voice evidence (five lanes: HN, GitHub, Bluesky, Exa web, xAI x_search) and merges it into the card as `founder_authored` citations; a second memoized step runs one LLM call over the card plus per-source digests; its Loud and Read claims append to the existing verify call, and the Quiet line gets a contradiction-only check. The result lives inside `synthesis` (public routes already strip it) and renders as the always-present sixth filing card in the Lens memo.

**Tech Stack:** Existing monorepo: zod schemas in `@cold-start/core`, provider fetchers in `@cold-start/providers`, LLM stage in `@cold-start/llm`, verify integration in `@cold-start/pipeline`, Inngest steps in `apps/web/src/inngest`, React display in `apps/extension`, node:test eval scorer in `eval/`.

## Global Constraints

Copied from the spec; every task's requirements implicitly include these.

- Never claim absence. Quiet statements only ever describe the filed record and must begin "Nothing filed shows".
- `thin_file` is decided in code before any model call or paid lane fetch. It costs nothing.
- Emphasis claims append into the existing `verify-synthesis` call via index offset; no second verify call.
- New source-quality tier is `founder_authored` (citation JSON) with extension posture `"founder-authored"`.
- `EMPHASIS_READ_ENABLED` defaults on (`!== "false"`), same pattern as `PERSON_READS_ENABLED`.
- The card label is exactly `Pay attention to`. Code name is `emphasisRead` everywhere. Backups recorded in the spec, not in code.
- Empty-state copy defaults: `Not enough filed.` (thin_file), `Nothing notable.` (nothing_notable), `Not read yet.` (legacy card, field absent). Samay approves final strings at review; these are the working defaults, not placeholders.
- API contract version bumps to `2026-08-12.emphasis-read-v1`; the extension rebuilds.
- Inngest step ids freeze once shipped. New ids: `fetch-founder-voice`, `emphasis-read`. Existing ids untouched. New progress events (`emphasis.started`, `emphasis.complete`) are additive; the extension progress model ignores unknown event types (verified: lookup maps in `research-progress.ts`).
- The xAI client is one wrapped module (`packages/providers/src/founder-voice/xai-x-search.ts`); nothing outside it references xAI request shapes. xAI x_search is a server-side tool attached to a grok chat call, not a model (docs: https://docs.x.ai/developers/tools/x-search). Never build an X path on Exa; its tweet coverage is empirically dead.
- Added cost under $0.10 per analysis run. Four of five lanes are free; the xAI call is budgeted at $0.05.
- No em dashes anywhere: prompts, copy, comments, commit messages.
- `XAI_API_KEY` lives in repo `.env.local` (verified working 2026-08-11) and goes into Vercel env at ship. Never in code or tracked files.
- Work happens in the worktree `.claude/worktrees/emphasis-read` (branch `emphasis-read` off main, spec cherry-picked). The main checkout is shared with live parallel sessions; never touch it. Run `npm ci` once in the worktree before Task 1, and `docker-compose up -d postgres` for the check gate.
- Done bar for the whole plan: full `npm run check` green in the worktree.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `packages/core/src/card.ts` (modify) | `emphasisReadSchema`, `synthesis.emphasisRead` field, `founder_authored` in the citation sourceQuality tier enum |
| `packages/core/src/source-quality.ts` (modify) | `founder_authored` tier, rank, `founderAuthoredQuality()` helper |
| `packages/core/src/emphasis-read.ts` (create) | thin-file gate, per-source digests, source-class mapping; pure logic, no fetches |
| `packages/core/src/generation-trace.ts` (modify) | `emphasis` trace block type, `emphasis_read` LLM stage |
| `packages/core/src/index.ts` (modify) | re-exports |
| `packages/providers/src/founder-voice/types.ts` (create) | lane names, item and result types; no core imports |
| `packages/providers/src/founder-voice/hn.ts` (create) | HN Algolia lane |
| `packages/providers/src/founder-voice/github.ts` (create) | GitHub author-activity lane |
| `packages/providers/src/founder-voice/bluesky.ts` (create) | Bluesky author-feed lane |
| `packages/providers/src/founder-voice/xai-x-search.ts` (create) | the wrapped xAI client |
| `packages/providers/src/founder-voice/exa-web.ts` (create) | Exa founder-web lane over the direct-exa client |
| `packages/providers/src/founder-voice/index.ts` (create) | orchestrator: all lanes, allSettled, budget timeouts |
| `packages/providers/src/direct-exa.ts` (modify) | export a generic request runner for the exa-web lane |
| `packages/providers/src/provider-budget.ts` (modify) | `founderVoice` budget family |
| `packages/providers/src/index.ts` (modify) | re-exports |
| `packages/llm/src/emphasis-read.ts` (create) | `synthesizeEmphasisRead`: tool, prompt spine, parse and validation |
| `packages/llm/src/llm-provider.ts` (modify) | `emphasis_read` stage env chain |
| `packages/llm/src/verifier.ts` (modify) | absence-claim rule in the verifier prompt |
| `packages/llm/src/index.ts` (modify) | re-exports |
| `packages/pipeline/src/generate-card.ts` (modify) | append emphasis claims to the verify call, `verifiedEmphasisRead` |
| `apps/web/src/inngest/emphasis-read.ts` (create) | step bodies: founder-voice fetch (sources plus citations), emphasis LLM call |
| `apps/web/src/inngest/worker-env.ts` (modify) | `emphasisReadEnabled()`, `founderVoiceEnvFromProcess()` |
| `apps/web/src/inngest/functions.ts` (modify) | the two new steps, events, trace, card merge |
| `packages/core/api-contract.json` (modify) | version bump |
| `apps/extension/src/research/investor-lens.ts` (modify) | `EmphasisDisplay`, sixth category, founder-authored posture |
| `apps/extension/src/research/investor-read-copy.ts` (modify) | empty copy and labels, import-free |
| `apps/extension/src/research/InvestorReadCard.tsx` (modify) | sixth filing card body |
| `apps/extension/src/styles/research-trail.css` (modify) | `.cs-lens-emphasis` rules, tokens only |
| `eval/investor-lens/score.mjs` (modify) | emphasis generic-phrase and specificity checks |
| `docs/anthropic-llm-call-map.md`, `docs/product/provider-cost-assumptions.md`, `CLAUDE.md`, `AGENTS.md`, `README.md` (modify) | doc alignment |

Tests: `packages/core/tests/emphasis-read.test.ts`, `packages/core/tests/synthesis-schema.test.ts` (extend), `packages/core/tests/source-quality.test.ts` (extend), `packages/providers/tests/founder-voice.test.ts`, `packages/llm/tests/emphasis-read.test.ts`, `packages/llm/tests/verifier.test.ts` (extend), `packages/pipeline/tests/generate-card.test.ts` (extend), `apps/extension/tests/investor-lens.test.ts` (extend), `apps/extension/tests/investor-read-card.test.tsx` (extend), `eval/investor-lens/score.test.mjs` (extend).

---

### Task 1: Card schema and founder-authored tier

**Files:**
- Modify: `packages/core/src/card.ts` (synthesisSchema around line 167, citationSchema sourceQuality tier enum around line 21)
- Modify: `packages/core/src/source-quality.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/tests/synthesis-schema.test.ts`, `packages/core/tests/source-quality.test.ts`

**Interfaces:**
- Consumes: existing `sourcedTextSchema`.
- Produces: `emphasisReadSchema`, `emphasisReadFiledSchema`, types `EmphasisRead`, `EmphasisReadFiled`; tier `"founder_authored"` in `SourceQualityTier` and in `citationSchema.sourceQuality.tier`; `founderAuthoredQuality(): { tier; label; rationale; incentive }`. Later tasks import all of these from `@cold-start/core`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/tests/synthesis-schema.test.ts` (follow the file's existing describe/it and fixture style):

```ts
describe("emphasisRead", () => {
  it("parses a legacy synthesis without the field unchanged", () => {
    // Reuse the file's existing minimal valid synthesis fixture; assert
    // synthesisSchema.parse(fixture) succeeds and result.emphasisRead is undefined.
  });

  it("parses a filed read with all four parts", () => {
    const parsed = emphasisReadSchema.parse({
      status: "read",
      loud: { text: "Their launch posts lead with model speed [fv1].", citationIds: ["fv1"] },
      quiet: "Nothing filed shows a named paying customer.",
      read: { text: "The loudest proof sits at working product, not demand [fv1] [c2].", citationIds: ["fv1", "c2"] },
      wouldChangeIf: "A named customer deployment appears in the filed record."
    });
    expect(parsed.status).toBe("read");
  });

  it("parses both empty states", () => {
    expect(emphasisReadSchema.parse({ status: "thin_file" }).status).toBe("thin_file");
    expect(emphasisReadSchema.parse({ status: "nothing_notable" }).status).toBe("nothing_notable");
  });

  it("rejects a filed read missing quiet", () => {
    expect(() => emphasisReadFiledSchema.parse({
      status: "read",
      loud: { text: "x [c1].", citationIds: ["c1"] },
      read: { text: "y [c1].", citationIds: ["c1"] },
      wouldChangeIf: "z"
    })).toThrow();
  });

  it("fails full-card validation when an emphasis citation does not resolve", () => {
    // Take the file's existing full valid card fixture, set
    // card.synthesis.emphasisRead to a filed read citing an id absent from
    // card.citations, and assert coldStartCardSchema.safeParse(card).success is false.
  });
});
```

Append to `packages/core/tests/source-quality.test.ts`:

```ts
it("ranks founder_authored between press_release and primary_company", () => {
  expect(sourceQualityTierRank("founder_authored")).toBe(3);
});

it("founderAuthoredQuality stamps the founder tier", () => {
  expect(founderAuthoredQuality().tier).toBe("founder_authored");
  expect(founderAuthoredQuality().label).toBe("Founder-authored");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w @cold-start/core -- synthesis-schema` and `npm test -w @cold-start/core -- source-quality`
Expected: FAIL (emphasisReadSchema, founderAuthoredQuality not defined).

- [ ] **Step 3: Implement**

In `packages/core/src/card.ts`, after `sourcedTextSchema` (line 112):

```ts
// The sixth Lens category: what the company and its founders are loud about, what never
// appears in the filed record, and the smallest inference that asymmetry supports. Quiet is
// a plain string scoped to the file ("Nothing filed shows..."), so it carries no citations;
// Loud and Read cite like any synthesis claim. thin_file is decided in code before any model
// call; nothing_notable is model-decided and also the fallback when the verifier kills a read.
export const emphasisReadFiledSchema = z.object({
  status: z.literal("read"),
  loud: sourcedTextSchema,
  quiet: z.string().min(1),
  read: sourcedTextSchema,
  wouldChangeIf: z.string().min(1)
});

export const emphasisReadSchema = z.discriminatedUnion("status", [
  emphasisReadFiledSchema,
  z.object({ status: z.literal("thin_file") }),
  z.object({ status: z.literal("nothing_notable") })
]);
export type EmphasisRead = z.infer<typeof emphasisReadSchema>;
export type EmphasisReadFiled = z.infer<typeof emphasisReadFiledSchema>;
```

In `synthesisSchema` (line 167), add after `openQuestions`:

```ts
  emphasisRead: emphasisReadSchema.optional(),
```

In `citationSchema.sourceQuality.tier` enum (line 21), add `"founder_authored"` after `"press_release"`.

In `packages/core/src/source-quality.ts`: add `| "founder_authored"` to `SourceQualityTier`; add `founder_authored: 3` to the rank map in `sourceQualityTierRank` (press_release stays 2, primary_company stays 4); add and export:

```ts
// Stamped by the founder-voice fetcher, never derived from a URL: knowing a page is
// founder-authored requires knowing the founder's handle, which only the fetcher has.
export function founderAuthoredQuality(): SourceQuality {
  return {
    tier: "founder_authored",
    label: "Founder-authored",
    rationale: "The founder's own public voice. Strong for what they choose to emphasize, weak for neutral evaluation.",
    incentive: "Personal and company promotion.",
  };
}
```

Export `companyAuthoredQuality` too (change `function companyAuthoredQuality` to `export function companyAuthoredQuality`); the founder-voice citation mapper in Task 6 stamps company-handle posts with it. Re-export the new names from `packages/core/src/index.ts` following its existing pattern (`emphasisReadSchema`, `emphasisReadFiledSchema`, `EmphasisRead`, `EmphasisReadFiled`, `founderAuthoredQuality`, `companyAuthoredQuality`).

`validateCitationRefs` already walks nested objects with a `citationIds` array, so loud/read get checked with no changes. `synthesisWithheldSchema` and the public strip need no work: synthesis is stripped wholesale.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w @cold-start/core -- synthesis-schema` and `npm test -w @cold-start/core -- source-quality`
Expected: PASS. Also run `npm run typecheck` at the repo root; `SourceQualityTier` is consumed in several packages and the enum addition must not break exhaustive switches (fix any `Record<SourceQualityTier, ...>` that now misses a key, e.g. none known besides the rank map).

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat: add emphasisRead schema and founder_authored source tier"
```

---

### Task 2: Thin-file gate and source digests (core)

**Files:**
- Create: `packages/core/src/emphasis-read.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/tests/emphasis-read.test.ts`

**Interfaces:**
- Consumes: `ColdStartCard`, `Citation`, `sourceQualityForSource` from Task 1's module state, `takeSentences` from `./sentences`.
- Produces:
  - `emphasisThinFileReason(card: ColdStartCard): "too-few-sources" | "no-company-authored" | null`
  - `emphasisSourceClass(citation: Citation, targetDomain: string): EmphasisSourceClass`
  - `emphasisSourceDigests(card: ColdStartCard): EmphasisSourceDigest[]`
  - types `EmphasisSourceClass`, `EmphasisSourceDigest`, `EmphasisThinFileReason`

- [ ] **Step 1: Write the failing tests**

Create `packages/core/tests/emphasis-read.test.ts`. Build citations with a tiny local helper (mirror `first-payoff.test.ts` fixture style):

```ts
import { describe, expect, it } from "vitest";
import {
  emphasisSourceDigests,
  emphasisThinFileReason,
  type ColdStartCard
} from "../src";

function citation(id: string, over: Partial<ColdStartCard["citations"][number]> = {}) {
  return {
    id,
    url: `https://example.com/${id}`,
    title: `Title ${id}`,
    fetchedAt: "2026-08-11T00:00:00.000Z",
    sourceType: "news" as const,
    snippet: "First sentence here. Second sentence follows. Third one never appears.",
    ...over
  };
}

// cardWith(citations) builds a minimal valid card object literal around them; copy the
// minimal-card fixture shape from packages/core/tests/synthesis-schema.test.ts.

describe("emphasisThinFileReason", () => {
  it("returns too-few-sources under four non-enrichment citations", () => {
    const card = cardWith([citation("c1"), citation("c2"), citation("e1", { sourceType: "enrichment" })]);
    expect(emphasisThinFileReason(card)).toBe("too-few-sources");
  });

  it("returns no-company-authored when nothing in the file is the company's own voice", () => {
    const card = cardWith([citation("c1"), citation("c2"), citation("c3"), citation("c4")]);
    expect(emphasisThinFileReason(card)).toBe("no-company-authored");
  });

  it("returns null when the file is readable", () => {
    const card = cardWith([
      citation("c1", { sourceType: "company_site", url: "https://acme.com/product" }),
      citation("c2"), citation("c3"), citation("c4")
    ]);
    expect(emphasisThinFileReason(card)).toBeNull();
  });
});

describe("emphasisSourceDigests", () => {
  it("digests each non-enrichment citation with class, headline, and a two-sentence lead", () => {
    const card = cardWith([
      citation("c1", { sourceType: "company_site", url: "https://acme.com/blog" }),
      citation("fv1", {
        sourceQuality: { tier: "founder_authored", label: "Founder-authored", rationale: "r", incentive: "i" }
      }),
      citation("e1", { sourceType: "enrichment" })
    ]);
    const digests = emphasisSourceDigests(card);
    expect(digests.map((d) => d.citationId)).toEqual(["c1", "fv1"]);
    expect(digests[0]).toMatchObject({ sourceClass: "company-authored", headline: "Title c1" });
    expect(digests[1]?.sourceClass).toBe("founder-authored");
    expect(digests[0]?.leadsWith).toBe("First sentence here. Second sentence follows.");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w @cold-start/core -- emphasis-read`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `packages/core/src/emphasis-read.ts`:

```ts
/*
 * Pure logic for the emphasis read (the sixth Lens category). The thin-file gate runs in
 * code before any model call or paid lane fetch, so a thin card costs nothing. Digests give
 * the LLM stage what each filed source is, says, and leads with, without shipping raw pages.
 */
import type { Citation, ColdStartCard } from "./card";
import { sourceQualityForSource } from "./source-quality";
import { takeSentences } from "./sentences";

export type EmphasisThinFileReason = "too-few-sources" | "no-company-authored";
export type EmphasisSourceClass =
  | "founder-authored"
  | "company-authored"
  | "reporting"
  | "independent"
  | "unknown";

export type EmphasisSourceDigest = {
  citationId: string;
  sourceClass: EmphasisSourceClass;
  headline: string;
  leadsWith: string;
};

const EMPHASIS_MIN_NON_ENRICHMENT_CITATIONS = 4;

function isEnrichmentLike(citation: Citation) {
  return citation.sourceType === "enrichment" || citation.sourceType === "rdap";
}

function tierFor(citation: Citation, targetDomain: string) {
  return (citation.sourceQuality ?? sourceQualityForSource(citation, { targetDomain })).tier;
}

export function emphasisSourceClass(citation: Citation, targetDomain: string): EmphasisSourceClass {
  const tier = tierFor(citation, targetDomain);
  if (tier === "founder_authored") return "founder-authored";
  if (tier === "primary_company" || tier === "press_release") return "company-authored";
  if (tier === "independent_technical" || tier === "independent_analysis") return "independent";
  if (tier === "independent_report" || citation.sourceType === "news" || citation.sourceType === "filing") return "reporting";
  return "unknown";
}

// The spec's triggers, verbatim: almost no sources, or zero company-authored ones. Runs on
// the card alone, before founder voice is fetched, so founder_authored never influences it.
export function emphasisThinFileReason(card: ColdStartCard): EmphasisThinFileReason | null {
  const substantive = card.citations.filter((citation) => !isEnrichmentLike(citation));
  if (substantive.length < EMPHASIS_MIN_NON_ENRICHMENT_CITATIONS) {
    return "too-few-sources";
  }

  const companyAuthored = substantive.filter((citation) => {
    const sourceClass = emphasisSourceClass(citation, card.domain);
    return sourceClass === "company-authored" || sourceClass === "founder-authored";
  });
  return companyAuthored.length === 0 ? "no-company-authored" : null;
}

export function emphasisSourceDigests(card: ColdStartCard): EmphasisSourceDigest[] {
  return card.citations
    .filter((citation) => !isEnrichmentLike(citation))
    .map((citation) => ({
      citationId: citation.id,
      sourceClass: emphasisSourceClass(citation, card.domain),
      headline: citation.title,
      leadsWith: takeSentences(citation.snippet ?? "", 2).join(" ").trim()
    }));
}
```

Re-export everything from `packages/core/src/index.ts`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w @cold-start/core -- emphasis-read`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat: emphasis thin-file gate and source digests"
```

---

### Task 3: Founder-voice free lanes (HN, GitHub, Bluesky)

**Files:**
- Create: `packages/providers/src/founder-voice/types.ts`, `hn.ts`, `github.ts`, `bluesky.ts`
- Test: `packages/providers/tests/founder-voice.test.ts`

**Interfaces:**
- Consumes: nothing from core (providers stays card-free; callers pass plain targets).
- Produces (all consumed by Task 4's orchestrator):

```ts
export type FounderVoiceLaneName =
  | "hn_search" | "github_author_activity" | "bluesky_author_feed" | "xai_x_search" | "exa_founder_web";

export type FounderVoiceItem = {
  lane: FounderVoiceLaneName;
  url: string;
  title: string;
  text: string;
  authorship: "founder" | "company" | "third_party";
  authorName?: string;
  publishedAt?: string;
};

export type FounderVoiceLaneResult = {
  lane: FounderVoiceLaneName;
  items: FounderVoiceItem[];
  estimatedCostUsd: number;
  failure?: string;
};

export type FounderVoiceTargets = {
  companyName: string;
  domain: string;
  founders: Array<{ name: string; xUrl?: string | null; githubUrl?: string | null }>;
};
```

Lane functions, each returning `Promise<FounderVoiceLaneResult>` and never throwing (failures land in `failure`):
- `fetchHnLane(input: { targets: FounderVoiceTargets; timeoutMs: number; fetchFn?: typeof fetch })`
- `fetchGithubLane(input: { targets: FounderVoiceTargets; githubToken?: string; timeoutMs: number; fetchFn?: typeof fetch })`
- `fetchBlueskyLane(input: { targets: FounderVoiceTargets; timeoutMs: number; fetchFn?: typeof fetch })`

`fetchFn` defaults to global `fetch`; tests inject a stub (same pattern as `packages/providers/tests/direct-exa.test.ts`, read it first and mirror its stub style).

- [ ] **Step 1: Write the failing tests**

Create `packages/providers/tests/founder-voice.test.ts` covering per lane: (a) happy path parses items with the right `authorship`; (b) HTTP failure or timeout returns `{ items: [], failure }` instead of throwing; (c) empty results return `{ items: [] }` with no failure. Concrete cases:

```ts
it("hn lane marks Show HN and company-domain stories as company voice", async () => {
  const fetchFn = stubJson({
    hits: [
      { title: "Show HN: Acme fast voice API", url: "https://acme.com/launch", author: "acmefounder", points: 120, created_at: "2026-07-01T00:00:00Z", story_text: null, objectID: "1" },
      { title: "Acme raises $20M", url: "https://techcrunch.com/acme", author: "reporter", points: 45, created_at: "2026-06-01T00:00:00Z", story_text: null, objectID: "2" }
    ]
  });
  const result = await fetchHnLane({ targets: TARGETS, timeoutMs: 5000, fetchFn });
  expect(result.items[0]?.authorship).toBe("company");
  expect(result.items[1]?.authorship).toBe("third_party");
  expect(result.estimatedCostUsd).toBe(0);
});

it("bluesky lane only adopts an actor whose bio names the company", async () => {
  // searchActors returns two actors; only one has "Acme" in description. getAuthorFeed
  // is called for that one; items come back authorship "founder".
});

it("github lane reads repo descriptions and push activity for founders with a githubUrl", async () => {
  // /users/octofounder/repos and /users/octofounder/events/public stubs; token present sets
  // the Authorization header; items authorship "founder".
});

it("a lane that rejects resolves to a failure result, never a throw", async () => {
  const fetchFn = async () => { throw new Error("network down"); };
  const result = await fetchHnLane({ targets: TARGETS, timeoutMs: 5000, fetchFn: fetchFn as typeof fetch });
  expect(result.items).toEqual([]);
  expect(result.failure).toContain("network down");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w @cold-start/providers -- founder-voice`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement the three lanes**

Shared shape inside each lane: an `AbortSignal.timeout(input.timeoutMs)` on every fetch, a try/catch that maps any error to `{ lane, items: [], estimatedCostUsd: 0, failure: message }`, and text fields trimmed and capped at 1,000 chars.

`hn.ts`: two GETs to `https://hn.algolia.com/api/v1/search`: `?query="<domain>"&tags=story&hitsPerPage=10` and `?query="Show HN <companyName>"&tags=story&hitsPerPage=10`. Merge hits, dedupe by `objectID`. Authorship: `company` when the title starts with `Show HN` (case-insensitive) or the story URL's hostname matches the target domain; else `third_party`. `title` from `hit.title`, `text` from `story_text ?? title`, `url` from `hit.url ?? https://news.ycombinator.com/item?id=<objectID>`, `publishedAt` from `created_at`. (The spec names this lane "by author"; HN usernames are not on the card, so v1 reads the company's HN footprint by domain and Show HN register. The by-author upgrade needs handle resolution and is a follow-on.)

`github.ts`: for each founder with a `githubUrl`, parse the username from the URL path's first segment. GET `https://api.github.com/users/<u>/repos?sort=pushed&per_page=5` (items from `name` + `description`) and `https://api.github.com/users/<u>/events/public?per_page=30` (keep `PushEvent` commit messages and `ReleaseEvent`/`IssuesEvent` titles, max 10 items per founder). Send `Authorization: Bearer <token>` and `X-GitHub-Api-Version: 2022-11-28` headers when `githubToken` is present. Authorship `founder`, `authorName` the founder's name.

`bluesky.ts`: for each founder, GET `https://public.api.bsky.app/xrpc/app.bsky.actor.searchActors?q=<encoded name>&limit=5`. Adopt an actor only when its `displayName` case-insensitively equals the founder name AND its `description` contains the company name or domain (both checks case-insensitive). Then GET `.../xrpc/app.bsky.feed.getAuthorFeed?actor=<did>&limit=20`, items from `feed[].post.record.text` with `url` `https://bsky.app/profile/<handle>/post/<rkey from uri>`. Authorship `founder`. Zero adopted actors is an empty result, not a failure (spec: probe and accept empties).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w @cold-start/providers -- founder-voice`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/providers
git commit -m "feat: founder-voice free lanes for HN, GitHub, and Bluesky"
```

---

### Task 4: xAI x_search client, Exa web lane, orchestrator, budget registry

**Files:**
- Create: `packages/providers/src/founder-voice/xai-x-search.ts`, `exa-web.ts`, `index.ts`
- Modify: `packages/providers/src/direct-exa.ts`, `packages/providers/src/provider-budget.ts`, `packages/providers/src/index.ts`
- Test: `packages/providers/tests/founder-voice.test.ts` (extend), `packages/providers/tests/provider-budget.test.ts` (extend)

**Interfaces:**
- Consumes: Task 3's types and lanes; `DirectExaEnv` and the direct-exa request runner.
- Produces:
  - `fetchXaiXSearchLane(input: { targets: FounderVoiceTargets; xaiApiKey?: string; timeoutMs: number; fetchFn?: typeof fetch }): Promise<FounderVoiceLaneResult>`
  - `fetchExaWebLane(input: { targets: FounderVoiceTargets; directExaEnv: DirectExaEnv; timeoutMs: number }): Promise<FounderVoiceLaneResult>`
  - `fetchFounderVoiceEvidence(input: { targets: FounderVoiceTargets; env: { xaiApiKey?: string; githubToken?: string; directExa: DirectExaEnv } }): Promise<{ laneResults: FounderVoiceLaneResult[]; items: FounderVoiceItem[]; estimatedCostUsd: number }>`
  - Budget family `providerBudgetRegistry.founderVoice` keyed by `FounderVoiceLaneName`.

- [ ] **Step 1: Verify the live xAI wire shape before coding it**

The docs at https://docs.x.ai/developers/tools/x-search are the source of truth for the tool block's exact field names (`allowed_x_handles`, date range). Run one live probe from the worktree (key already in `.env.local`):

```bash
set -a; source .env.local; set +a
curl -sS https://api.x.ai/v1/chat/completions \
  -H "Authorization: Bearer $XAI_API_KEY" -H "Content-Type: application/json" \
  -d '{"model":"grok-4.20-non-reasoning-latest","max_tokens":600,
       "messages":[{"role":"user","content":"Return a JSON array of up to 5 recent posts by these handles about their company. Fields: handle, date, url, text."}],
       "tools":[{"type":"x_search","x_search":{"allowed_x_handles":["cartesia_ai"]}}]}' | head -c 2000
```

If the tool block is rejected, adjust the field names to what the live docs say and record the working shape in a comment at the top of `xai-x-search.ts`. This costs a few cents once and prevents building against a guessed schema.

- [ ] **Step 2: Write the failing tests**

Extend `packages/providers/tests/founder-voice.test.ts`:

```ts
it("xai lane restricts to derivable handles and parses the JSON post array", async () => {
  // TARGETS has one founder with xUrl "https://x.com/acmefounder". Stub fetchFn asserts the
  // request body's tool block contains allowed_x_handles ["acmefounder"], returns a chat
  // completion whose message content is a JSON array of two posts. Expect two items,
  // authorship "founder", estimatedCostUsd 0.05.
});

it("xai lane without a key or any handle is a silent empty, not a failure", async () => {
  const result = await fetchXaiXSearchLane({ targets: NO_HANDLE_TARGETS, timeoutMs: 5000 });
  expect(result.items).toEqual([]);
  expect(result.failure).toBeUndefined();
});

it("xai lane recovers the JSON array from a chatty completion", async () => {
  // Content is "Here are the posts:\n[{...}]\nHope that helps." Parser slices first [ to
  // last ] (same strategy as the verifier's stripJsonFence) and still returns items.
});

it("orchestrator runs every lane, tolerates one lane failing, and sums cost", async () => {
  // Inject lane stubs via the deps parameter; one rejects. laneResults has 5 entries,
  // failing lane carries failure, items concatenates the rest, estimatedCostUsd sums.
});
```

Extend `packages/providers/tests/provider-budget.test.ts`: `providerBudgetRegistry.founderVoice.xai_x_search.estimatedCostUsd` is `0.05`, every founderVoice entry has a positive `timeoutMs`, and the free lanes carry `estimatedCostUsd` 0.

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -w @cold-start/providers -- founder-voice` and `npm test -w @cold-start/providers -- provider-budget`
Expected: FAIL.

- [ ] **Step 4: Implement**

`xai-x-search.ts` is the ONLY module that knows xAI request shapes (Global Constraints: xAI churned its search surface once in 2026 already; swapping providers must not touch callers):

```ts
// xAI x_search is a server-side tool attached to a grok chat call, not a model.
// Wire shape verified live on 2026-08-1x against https://docs.x.ai/developers/tools/x-search.
// This module is the single place that knows it; swap providers here, never in callers.
const XAI_CHAT_URL = "https://api.x.ai/v1/chat/completions";
const XAI_XSEARCH_MODEL = process.env.XAI_XSEARCH_MODEL ?? "grok-4.20-non-reasoning-latest";
export const XAI_XSEARCH_EST_COST_USD = 0.05;
```

Behavior: derive handles from founder `xUrl`s (first path segment of `x.com` or `twitter.com` URLs). No key or no handles: return empty with no failure. Otherwise one POST with `max_tokens` 1500, a user prompt asking for a strict JSON array of recent posts (fields `handle`, `date`, `url`, `text`) by the allowed handles about the company, and the verified tool block with `allowed_x_handles` (cap 20) and a from-date 12 months back. Parse content by slicing first `[` to last `]` then `JSON.parse`; malformed content is a `failure`. Items: authorship `founder` (or `company` when the handle equals a company handle, when one is ever derivable), `url` from the post, `estimatedCostUsd` `XAI_XSEARCH_EST_COST_USD`.

`direct-exa.ts`: export the module's internal per-request fetch loop as `fetchDirectExaRequests(input: { env: DirectExaEnv; requests: DirectExaRequest[] }): Promise<DirectExaSourcesResult>` (extract from `fetchDirectExaFundamentalsSources`'s body so both call one runner; behavior of the existing exports must not change, their tests stay green).

`exa-web.ts`: build two `DirectExaRequest`s per run: `"<companyName>" founder interview OR blog OR substack` and `"<founder name>" "<companyName>"` for the first founder; call `fetchDirectExaRequests`; map returned sources to items with authorship `third_party` (interviews and profiles are about the founders, not by them) except results whose hostname matches the company domain (authorship `company`). `estimatedCostUsd`: `DIRECT_EXA_SEARCH_COST_USD * requestCount`.

`index.ts` (orchestrator): take an optional `lanes` deps object (defaults to the five real lane fns) so tests inject stubs; run all five through `Promise.allSettled`, using each lane's `timeoutMs` from `providerBudgetRegistry.founderVoice`; a rejected promise becomes a failure-only lane result. Concatenate items, cap at 40 total (drop overflow from the largest lane first), sum `estimatedCostUsd`.

`provider-budget.ts`: make the endpoint type generic with a default so existing entries do not change:

```ts
export type ProviderEndpointBudget<TEndpoint extends string = StableenrichProbeName> = { endpoint: TEndpoint; ... };
export type ProviderBudgetRegistry = {
  stableenrich: Record<StableenrichProbeName, ProviderEndpointBudget>;
  founderVoice: Record<FounderVoiceLaneName, ProviderEndpointBudget<FounderVoiceLaneName>>;
};
```

Entries (all `mode: "search"`, `expectedFacts: []`, `maxCallsPerRun: 1`): `hn_search` (timeout 10_000, cost 0, stop "stop after the company's HN footprint is read"), `github_author_activity` (15_000, 0, "stop after founder repos and recent public activity"), `bluesky_author_feed` (10_000, 0, "stop after matched founder feeds or confirmed no match"), `xai_x_search` (30_000, 0.05, "stop after one restricted x_search pass over derivable handles"), `exa_founder_web` (18_000, 0.014, "stop after founder interview and blog coverage").

Re-export the orchestrator, lane types, and `FounderVoiceTargets` from `packages/providers/src/index.ts`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -w @cold-start/providers`
Expected: PASS, including the untouched direct-exa suite.

- [ ] **Step 6: Commit**

```bash
git add packages/providers
git commit -m "feat: xAI x_search lane, Exa founder-web lane, and founder-voice orchestrator"
```

---

### Task 5: LLM stage `synthesizeEmphasisRead`

**Files:**
- Create: `packages/llm/src/emphasis-read.ts`
- Modify: `packages/llm/src/llm-provider.ts`, `packages/llm/src/index.ts`
- Modify: `packages/core/src/generation-trace.ts` (stage union, line 53)
- Test: `packages/llm/tests/emphasis-read.test.ts`

**Interfaces:**
- Consumes: `EmphasisRead`, `EmphasisReadFiled`, `EmphasisSourceDigest` from core; `investorTasteKernel`, `withProviderFallback`, `withSchemaRetry`, `createTracedAnthropicMessage`, `parseToolUse` from llm internals.
- Produces: `synthesizeEmphasisRead(input: { client: Anthropic; model: string; card: ColdStartCard; digests: EmphasisSourceDigest[]; telemetry?: AnthropicTelemetrySink }): Promise<EmphasisRead>` returning only `status: "read"` or `status: "nothing_notable"` (thin_file never reaches this stage). Also `parseEmphasisReadToolUse` exported for tests.

- [ ] **Step 1: Write the failing tests**

Create `packages/llm/tests/emphasis-read.test.ts` (mirror `synthesis.test.ts`'s tool-use fixture style: build `{ content: [{ type: "tool_use", name, input }] }` messages and call the parser directly):

```ts
it("parses a full read and normalizes citation markers", () => {
  // input: status "read", loud/read with visible markers matching citationIds,
  // quiet "Nothing filed shows a named paying customer.", wouldChangeIf non-empty.
  // Expect parsed.status "read" and marker multiset preserved.
});

it("parses nothing_notable with null parts", () => {
  // input: { status: "nothing_notable", loud: null, quiet: null, read: null, wouldChangeIf: null }
});

it("rejects a read whose quiet does not start with Nothing filed shows", () => {
  // quiet: "They have no revenue." must throw (never-claim-absence rule enforced in code).
});

it("rejects a read whose visible markers do not match citationIds", () => {});

it("rejects a read citing an id absent from the card", () => {
  // assertEmphasisCitationsExistOnCard behavior via synthesizeEmphasisRead's validator,
  // exercised through the exported validate helper on the parsed object plus a card fixture.
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w @cold-start/llm -- emphasis-read`
Expected: FAIL.

- [ ] **Step 3: Implement**

Tool (reuse `sourcedTextSchema`-style JSON schema fragments from `synthesis.ts`; extract the shared `sourcedTextSchema`/`nonEmptyStringSchema` tool fragments into a tiny `tool-schema-fragments.ts` if importing across files is cleaner than copying, keep it minimal):

```ts
const EMPHASIS_READ_TOOL_NAME = "emit_emphasis_read";
const emphasisReadTool = {
  name: EMPHASIS_READ_TOOL_NAME,
  description: "Emit the emphasis read: what this company is loud about, what the filed record never shows, and the smallest inference that asymmetry supports. Emit nothing_notable when no specific cited asymmetry exists.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      status: { type: "string", enum: ["read", "nothing_notable"] },
      loud: { anyOf: [sourcedTextToolSchema, { type: "null" }] },
      quiet: { anyOf: [{ type: "string", minLength: 1 }, { type: "null" }] },
      read: { anyOf: [sourcedTextToolSchema, { type: "null" }] },
      wouldChangeIf: { anyOf: [{ type: "string", minLength: 1 }, { type: "null" }] }
    },
    required: ["status", "loud", "quiet", "read", "wouldChangeIf"]
  }
} satisfies Tool;
```

Zod post-validation: when `status` is `"read"`, all four parts must be non-null, `quiet` must match `/^Nothing filed shows/`, loud/read visible-marker multisets must equal their citationIds (reuse the multiset helpers; extract them from `synthesis.ts` into a shared internal module rather than copying), and every cited id must exist on `input.card.citations`. When `nothing_notable`, collapse to `{ status: "nothing_notable" }`.

System prompt: the spec's prompt spine, verbatim in intent:

```ts
export const emphasisReadSystemPrompt = [
  investorTasteKernel,
  "You read what this company and its founders choose to be loud about, and what the filed record never shows.",
  "The proof ladder, strongest first: paying customers, then demand, then a working product, then a real problem, then team, then idea. Name where their loudest proof sits on it.",
  "Never use stage benchmarks or what companies at this stage usually disclose. The inference comes only from the observed communication: what they publish, what it leads with, who the writing is aimed at.",
  "Loud states what their own publishing leads with, cited to the digests that show it.",
  "Quiet must begin with the words Nothing filed shows, and may only ever describe this filed record. Never state that the company lacks something; absence on the web is not knowable.",
  "Read is the smallest specific inference the observed pattern supports, cited to the facts it uses. Stage is a plain fact the inference may use, never a yardstick.",
  "wouldChangeIf names the concrete thing that, if it appeared in the filed record, would break the read.",
  "The tone is loud and quiet, never accusation.",
  "The bar is a specific cited asymmetry. If the line could be pasted onto any startup, emit nothing_notable instead. Emitting nothing is never penalized.",
  "One fact, one job. If the gap is the decision hinge, the open questions already carry it; do not duplicate the bear case.",
  "Write in plain English for a sharp investor reading a narrow side panel.",
  "Never use an em dash anywhere. Use a period or a semicolon instead."
].join(" ");
```

Call shape copies `synthesizeCard`: `withProviderFallback("emphasis_read", ...)` wrapping `withSchemaRetry`, `createTracedAnthropicMessage` with `label: "emphasis-read"`, `stage: "emphasis_read"`, `max_tokens: 1200`, `temperature: 0.2`, cached system prompt, forced `tool_choice`. User content: `JSON.stringify({ company: { name, domain }, digests: input.digests })`.

Stage registration: in `packages/core/src/generation-trace.ts` line 53 add `"emphasis_read"` to the stage union. In `packages/llm/src/llm-provider.ts` add to the env-chain map `emphasis_read: ["LLM_EMPHASIS_READ_MODEL", "LLM_SYNTHESIS_MODEL", "ANTHROPIC_SYNTHESIS_MODEL"]` (piggybacks the synthesis judgment chain like `research_section` and `person_read`), extend `LlmFallbackStage` and the fallback-var map with `emphasis_read: "LLM_EMPHASIS_READ_FALLBACK_MODEL"`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w @cold-start/llm` (the whole workspace: `llm-provider.test.ts` may assert stage maps exhaustively and must be extended, not broken).
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core packages/llm
git commit -m "feat: emphasis read LLM stage on the synthesis model chain"
```

---

### Task 6: Verifier absence rule and pipeline verify integration

**Files:**
- Modify: `packages/llm/src/verifier.ts` (system prompt, line 128)
- Modify: `packages/pipeline/src/generate-card.ts` (verifyCardSynthesisDraft, line 859)
- Modify: `packages/core/src/generation-trace.ts` (trace `emphasis` block, after the `synthesis` block near line 221)
- Test: `packages/llm/tests/verifier.test.ts` (extend), `packages/pipeline/tests/generate-card.test.ts` (extend)

**Interfaces:**
- Consumes: `EmphasisReadFiled`, `EmphasisRead` from core; `applyVerifierResults` from llm.
- Produces:
  - `verifyCardSynthesisDraft(card, draft, deps, extras?: { emphasisRead?: EmphasisReadFiled })` now returns `{ synthesis?; emphasisRead?: EmphasisRead; emphasisDropReason?: "loud-dropped" | "read-dropped" | "quiet-contradicted"; tracePatch }`.
  - Trace type gains:

```ts
emphasis?: {
  enabled: boolean;
  status?: "read" | "thin_file" | "nothing_notable";
  thinFileReason?: string;
  dropReason?: string;
  laneCounts?: Record<string, number>;
  laneFailures?: string[];
  estimatedLaneCostUsd?: number;
};
```

(`generationTraceSchema` is `.passthrough()`, so only the TS type changes.)

- [ ] **Step 1: Write the failing tests**

Extend `packages/pipeline/tests/generate-card.test.ts` (follow its existing `verifyCardSynthesisDraft` test fixtures; there are already verifier-dropped cases to copy the harness from):

```ts
it("appends emphasis claims after market claims and keeps a fully supported read", async () => {
  // Draft with whyItMatters + 1 bull + 1 bear + 0 market claims. extras.emphasisRead filed.
  // The stub verify fn asserts it received 3 + 3 claims, with claims[3] the loud text,
  // claims[4] the read text, claims[5] { text: "Nothing filed shows...", citationIds: [] }.
  // It returns supported for indexes 0..4 and unsupported for 5 (the verifier cannot
  // confirm absence). Expect result.emphasisRead to be the filed read: quiet unsupported
  // must NOT kill it.
});

it("kills the whole read when quiet is contradicted", async () => {
  // Same setup; verify returns supported 0..4, contradicted for 5.
  // Expect result.emphasisRead = { status: "nothing_notable" },
  // result.emphasisDropReason = "quiet-contradicted".
});

it("kills the read when loud is dropped", async () => {
  // verify returns unsupported for the loud index. Expect nothing_notable, "loud-dropped".
});

it("without extras the verify call payload is unchanged", async () => {
  // stub verify asserts claims.length === allSynthesisClaims length; result has no
  // emphasisRead key. This is the EMPHASIS_READ_ENABLED=false path staying byte-identical.
});
```

Extend `packages/llm/tests/verifier.test.ts` with a prompt-content assertion in the file's existing style (it stubs the Anthropic client and can inspect `params.system`): the system prompt contains the absence-claim rule sentence.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w @cold-start/pipeline -- generate-card` and `npm test -w @cold-start/llm -- verifier`
Expected: FAIL.

- [ ] **Step 3: Implement**

`verifier.ts`: append one sentence to the system prompt array (before the "Return only a JSON array" line):

```ts
"A claim with an empty citationIds array whose text begins with Nothing filed shows describes an absence in this record: mark it contradicted only when a supplied source or fact contains the thing it says is missing; otherwise mark it supported.",
```

`generate-card.ts`: in `verifyCardSynthesisDraft`, accept `extras?: { emphasisRead?: EmphasisReadFiled }`. Build the claim list:

```ts
const emphasis = extras?.emphasisRead;
const emphasisClaims: SourcedText[] = emphasis
  ? [emphasis.loud, emphasis.read, { text: emphasis.quiet, citationIds: [] }]
  : [];
const claims = [...allSynthesisClaims(synthesis), ...emphasisClaims];
```

After the existing offset math (`marketOffset`), add:

```ts
const emphasisOffset = marketOffset + marketStructureClaims(synthesis).length;
```

and after the gate section, before returning:

```ts
function verifiedEmphasisRead(
  filed: EmphasisReadFiled,
  results: VerificationResult[],
  offset: number
): { emphasisRead: EmphasisRead; dropReason?: "loud-dropped" | "read-dropped" | "quiet-contradicted" } {
  const loudKept = applyVerifierResults([filed.loud], results, offset).length === 1;
  const readKept = applyVerifierResults([filed.read], results, offset + 1).length === 1;
  // Quiet is contradiction-only: the verifier cannot confirm absence, so supported and
  // unsupported both let the read stand; only a source containing the missing thing kills it.
  const quietContradicted = results.some(
    (result) => result.claimIndex === offset + 2 && result.status === "contradicted"
  );
  if (loudKept && readKept && !quietContradicted) {
    return { emphasisRead: filed };
  }
  return {
    emphasisRead: { status: "nothing_notable" },
    dropReason: quietContradicted ? "quiet-contradicted" : loudKept ? "read-dropped" : "loud-dropped"
  };
}
```

Thread the outcome into every return path: when `extras?.emphasisRead` is present, both the early no-survivor return and the gated return include `emphasisRead` and `emphasisDropReason` (the emphasis verdict is independent of whether whyItMatters survived; the caller decides where it can attach). `claimCountBeforeVerify` reported in the trace stays the synthesis count (the draft computed it before emphasis existed); do not fold emphasis claims into it.

Trace: add the `emphasis` block type to `GenerationTrace` in `packages/core/src/generation-trace.ts` exactly as in the Interfaces block above.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w @cold-start/pipeline` and `npm test -w @cold-start/llm`
Expected: PASS, including all pre-existing verifier-dropped cases.

- [ ] **Step 5: Commit**

```bash
git add packages/core packages/llm packages/pipeline
git commit -m "feat: verify emphasis claims inside the existing verify call"
```

---

### Task 7: Inngest wiring (steps, events, trace, storage)

**Files:**
- Create: `apps/web/src/inngest/emphasis-read.ts`
- Modify: `apps/web/src/inngest/worker-env.ts`, `apps/web/src/inngest/generation-helpers.ts` (only if a helper fits better there; default everything into the new module), `apps/web/src/inngest/functions.ts`
- Test: `apps/web/tests/emphasis-read.test.ts` (create; `apps/web/tests/` is the web workspace's vitest home, mirror an existing inngest-module test there such as the card-storage or generation-helpers tests for setup style)

**Interfaces:**
- Consumes: Task 2's gate/digests, Task 4's orchestrator, Task 5's stage, Task 6's verify extras.
- Produces:
  - `emphasisReadEnabled(): boolean` and `founderVoiceEnvFromProcess(): { xaiApiKey?: string; githubToken?: string; directExa: DirectExaEnv }` in `worker-env.ts`
  - In `apps/web/src/inngest/emphasis-read.ts`:

```ts
export function founderVoiceTargetsFromCard(card: ColdStartCard): FounderVoiceTargets;
export function founderVoiceCitations(items: FounderVoiceItem[]): Citation[];        // ids fv1..fvN
export function founderVoiceProviderSources(items: FounderVoiceItem[]): ProviderSource[];
export type FetchFounderVoiceStepValue = {
  sources: ProviderSource[];
  citations: Citation[];
  laneCounts: Record<string, number>;
  laneFailures: string[];
  estimatedCostUsd: number;
};
export async function fetchFounderVoiceStepBody(input: { card: ColdStartCard; env: FounderVoiceEnv }): Promise<FetchFounderVoiceStepValue>;
export type EmphasisReadStepResult = { ok: true; value: EmphasisRead } | { ok: false; error: string };
export async function emphasisReadStepBody(input: { card: ColdStartCard; client: Anthropic; model: string; telemetry: AnthropicTelemetrySink }): Promise<EmphasisReadStepResult>;
```

- [ ] **Step 1: Write the failing tests**

`apps/web/tests/emphasis-read.test.ts`:

```ts
it("founderVoiceCitations builds fv-prefixed citations and stamps authorship tiers", () => {
  // founder item -> sourceQuality.tier "founder_authored"; company item -> "primary_company";
  // third_party item -> no sourceQuality stamped (derived downstream).
  // ids are fv1, fv2, fv3 in item order; sourceType "other" except github lane -> "github";
  // snippet is item.text capped at 240 chars.
});

it("founderVoiceTargetsFromCard pulls name, domain, and founder channels", () => {
  // Card fixture with two founders, one carrying xUrl and githubUrl.
});

it("emphasisReadStepBody memoizes a semantic failure and rethrows transient errors", async () => {
  // Same contract as synthesizeCardStepBody: a schema error from the stage returns
  // { ok: false }; a stubbed transient error (use isTransientLlmError's known shapes,
  // e.g. an APIError with status 529) is rethrown.
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w @cold-start/web -- emphasis-read`
Expected: FAIL.

- [ ] **Step 3: Implement the module and env accessors**

`worker-env.ts`:

```ts
export function emphasisReadEnabled() {
  return process.env.EMPHASIS_READ_ENABLED !== "false";
}

export type FounderVoiceEnv = { xaiApiKey?: string; githubToken?: string; directExa: DirectExaEnv };

export function founderVoiceEnvFromProcess(): FounderVoiceEnv {
  const xaiApiKey = process.env.XAI_API_KEY?.trim();
  return {
    ...(xaiApiKey ? { xaiApiKey } : {}),
    ...(githubTokenFromProcess() ? { githubToken: githubTokenFromProcess() } : {}),
    directExa: directExaEnvFromProcess()
  };
}
```

`apps/web/src/inngest/emphasis-read.ts`: `founderVoiceTargetsFromCard` maps `identity.name.value ?? domain`, `card.domain`, and `team.founders.value ?? []` to targets. `founderVoiceCitations` stamps `founderAuthoredQuality()` for `authorship: "founder"`, `companyAuthoredQuality()` for `"company"`, nothing for `"third_party"`; `url`, `title`, `fetchedAt` now-ISO, `sourceType` `"github"` for the github lane else `"other"`, `snippet` capped 240. `fetchFounderVoiceStepBody` calls `fetchFounderVoiceEvidence` and maps to the step value (lane failures are data, not throws). `emphasisReadStepBody` computes `emphasisSourceDigests(input.card)` and wraps `synthesizeEmphasisRead` in the exact catch-and-memoize pattern of `synthesizeCardStepBody` (transient rethrow, semantic `{ ok: false }`).

- [ ] **Step 4: Wire `functions.ts`**

In the analysis branch, inside the `else` (gate not blocked), after the `synthesize-card` step result is unwrapped into `draft` and BEFORE the `verify-started` event:

```ts
let emphasisDraft: EmphasisRead | null = null;
if (emphasisReadEnabled()) {
  const thinFileReason = emphasisThinFileReason(generatedCard);
  if (thinFileReason) {
    emphasisDraft = { status: "thin_file" };
    mergeTracePatch(trace, { emphasis: { enabled: true, status: "thin_file", thinFileReason } });
    trace.steps = {
      ...trace.steps,
      "fetch-founder-voice": skippedStep(`thin file: ${thinFileReason}`),
      "emphasis-read": skippedStep(`thin file: ${thinFileReason}`)
    };
  } else {
    await recordEvent("emphasis-started", "emphasis.started", "Reading what they are loud about", {}, null);
    currentStage = "fetch-founder-voice";
    const founderVoice = await step.run("fetch-founder-voice", async () => {
      const result = await timed(() =>
        fetchFounderVoiceStepBody({ card: generatedCard, env: founderVoiceEnvFromProcess() })
      );
      return {
        value: result.value,
        tracePatch: { steps: { "fetch-founder-voice": completedStep(result.durationMs) } }
      };
    });
    mergeTracePatch(trace, founderVoice.tracePatch);
    mergeTracePatch(trace, {
      emphasis: {
        enabled: true,
        laneCounts: founderVoice.value.laneCounts,
        laneFailures: founderVoice.value.laneFailures,
        estimatedLaneCostUsd: founderVoice.value.estimatedCostUsd
      }
    });
    if (founderVoice.value.citations.length > 0) {
      generatedCard = { ...generatedCard, citations: [...generatedCard.citations, ...founderVoice.value.citations] };
      sourcesToRecord = [...sourcesToRecord, ...founderVoice.value.sources];
    }

    currentStage = "emphasis-read";
    const emphasisResult = await step.run("emphasis-read", async () => {
      const llmTelemetry = createStepLlmTelemetryCollector();
      const result = await timed(() =>
        emphasisReadStepBody({ card: generatedCard, client: anthropic, model: emphasisModel, telemetry: llmTelemetry.telemetry })
      );
      const llmTracePatch = llmTelemetry.tracePatch();
      return {
        value: result.value,
        tracePatch: {
          ...llmTracePatch,
          steps: {
            "emphasis-read": result.value.ok
              ? completedStep(result.durationMs)
              : { status: "failed" as const, durationMs: result.durationMs, message: result.value.error }
          }
        }
      };
    });
    mergeTracePatch(trace, emphasisResult.tracePatch);
    // A semantic emphasis failure degrades to nothing_notable; it never fails the run.
    emphasisDraft = emphasisResult.value.ok ? emphasisResult.value.value : { status: "nothing_notable" };
  }
} else {
  trace.steps = {
    ...trace.steps,
    "fetch-founder-voice": skippedStep("EMPHASIS_READ_ENABLED=false"),
    "emphasis-read": skippedStep("EMPHASIS_READ_ENABLED=false")
  };
}
```

`emphasisModel` joins the model list at the top of the try block: `const emphasisModel = modelForStage("emphasis_read", defaultModel);`.

The `verify-synthesis` step body call gains the extras argument:

```ts
verifySynthesisStepBody({
  card: generatedCard,
  draft,
  ...(emphasisDraft?.status === "read" ? { emphasisRead: emphasisDraft } : {}),
  client: anthropic,
  model: verifierModel,
  telemetry: llmTelemetry.telemetry,
  synthesisRequired: true
})
```

(`verifySynthesisStepBody` in `generation-helpers.ts` grows the optional `emphasisRead?: EmphasisReadFiled` input and passes it through as `verifyCardSynthesisDraft`'s `extras`.)

After the verify result is unwrapped:

```ts
const finalEmphasis: EmphasisRead | undefined = emphasisDraft
  ? emphasisDraft.status === "read"
    ? verified.emphasisRead ?? { status: "nothing_notable" }
    : emphasisDraft
  : undefined;
if (finalEmphasis) {
  mergeTracePatch(trace, {
    emphasis: {
      enabled: true,
      status: finalEmphasis.status,
      ...(verified.emphasisDropReason ? { dropReason: verified.emphasisDropReason } : {})
    }
  });
  await recordEvent("emphasis-complete", "emphasis.complete", finalEmphasis.status === "read" ? "Emphasis read filed" : "No emphasis read", { status: finalEmphasis.status, ...(verified.emphasisDropReason ? { dropReason: verified.emphasisDropReason } : {}) }, null);
}
```

and where synthesis attaches (the `verified.synthesis` branch):

```ts
generatedCard = { ...cardWithoutWithheld, synthesis: { ...verified.synthesis, ...(finalEmphasis ? { emphasisRead: finalEmphasis } : {}) } };
```

The gate-blocked branch (`gateOutcome.blocked`) adds the two skipped-step notes alongside the existing synthesize/verify skips. `mergeTracePatch` merges shallow objects per top-level key (confirm against `generation-trace.ts`'s implementation while editing; if it replaces the `emphasis` key wholesale, accumulate the emphasis patch in a local object and merge once).

Check `emphasis.started` / `emphasis.complete` against `packages/core/src/alpha-analytics.ts` and the events route only if run events are validated there; run events (`recordResearchRunEvent`) are free-form typed strings, so no registry change is expected. Verify by grepping for `"verify.complete"` outside the extension; if a server-side allowlist exists, add the two names there.

- [ ] **Step 5: Run tests and typecheck**

Run: `npm test -w @cold-start/web` and `npm run typecheck`
Expected: PASS. The functions.ts wiring itself is covered by typecheck plus the step-body unit tests; the storage merge is covered next task.

- [ ] **Step 6: Storage regression test**

Add to the existing card-storage test file in `apps/web/tests/` (find it with `ls apps/web/tests | grep -i storage`): a card whose `synthesis.emphasisRead` is a filed read goes through `prepareCardSnapshotForStorage(mode="basics", existing-with-emphasis, fresh-basics-card)` and the preserved synthesis still carries `emphasisRead` (synthesis is preserved as a unit; this pins it).

Run: `npm test -w @cold-start/web`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web packages/core
git commit -m "feat: run the emphasis read as memoized analysis steps"
```

---

### Task 8: API contract bump and extension display model

**Files:**
- Modify: `packages/core/api-contract.json`
- Modify: `apps/extension/src/research/investor-lens.ts`, `apps/extension/src/research/investor-read-copy.ts`
- Test: `apps/extension/tests/investor-lens.test.ts` (extend)

**Interfaces:**
- Consumes: `EmphasisRead` shape on `card.synthesis.emphasisRead` (via the card JSON; the extension reads through `@cold-start/core` types).
- Produces:
  - `EMPHASIS_EMPTY_COPY = { thinFile: "Not enough filed.", nothingNotable: "Nothing notable.", notRead: "Not read yet." }` and `EMPHASIS_LABELS = { loud: "Loud", quiet: "Quiet", read: "The read", wouldChangeIf: "Would change if" }` in `investor-read-copy.ts` (import-free module, keep it that way).
  - `EmphasisDisplay = { state: "read" | "thin_file" | "nothing_notable" | "not_read"; loud: string | null; quiet: string | null; read: string | null; wouldChangeIf: string | null }`
  - `InvestorReadDisplay.emphasis: EmphasisDisplay`
  - `InvestorLensCategoryId` union gains `"pay-attention"`; `investorLensCategories` returns six entries with the sixth `{ id: "pay-attention", label: "Pay attention to", preview }`.
  - `SourcePosture` gains `"founder-authored"`.

- [ ] **Step 1: Write the failing tests**

Extend `apps/extension/tests/investor-lens.test.ts`:

```ts
it("returns six categories with Pay attention to last", () => {
  const categories = investorLensCategories(readFixture);
  expect(categories).toHaveLength(6);
  expect(categories[5]).toMatchObject({ id: "pay-attention", label: "Pay attention to" });
});

it("previews the read text when the emphasis read is filed", () => {});

it("previews flat empty copy for thin_file, nothing_notable, and a legacy card", () => {
  // thin_file -> "Not enough filed.", nothing_notable -> "Nothing notable.",
  // synthesis without the field -> "Not read yet." (assert via EMPHASIS_EMPTY_COPY constants).
});

it("strips citation markers from loud and read in the display model", () => {});

it("classifies a founder_authored citation as founder-authored posture", () => {
  expect(sourcePostureForCitation(citationWithTier("founder_authored"))).toBe("founder-authored");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w @cold-start/extension -- investor-lens`
Expected: FAIL.

- [ ] **Step 3: Implement**

`investor-read-copy.ts`: add the two constants (keep the module import-free; the Playwright ESM loader constraint in the file's header comment still applies).

`investor-lens.ts`:

```ts
export type EmphasisDisplayState = "read" | "thin_file" | "nothing_notable" | "not_read";
export type EmphasisDisplay = {
  state: EmphasisDisplayState;
  loud: string | null;
  quiet: string | null;
  read: string | null;
  wouldChangeIf: string | null;
};

export function emphasisDisplayForCard(card: ColdStartCard): EmphasisDisplay {
  const emphasis = card.synthesis?.emphasisRead;
  if (!emphasis) {
    return { state: "not_read", loud: null, quiet: null, read: null, wouldChangeIf: null };
  }
  if (emphasis.status !== "read") {
    return { state: emphasis.status, loud: null, quiet: null, read: null, wouldChangeIf: null };
  }
  return {
    state: "read",
    loud: stripCitationMarkers(emphasis.loud.text),
    quiet: emphasis.quiet,
    read: stripCitationMarkers(emphasis.read.text),
    wouldChangeIf: emphasis.wouldChangeIf
  };
}
```

`investorReadForCard` adds `emphasis: emphasisDisplayForCard(card)` to the returned display. Sixth category entry:

```ts
{
  id: "pay-attention",
  label: "Pay attention to",
  preview: read.emphasis.read
    ?? (read.emphasis.state === "thin_file"
      ? EMPHASIS_EMPTY_COPY.thinFile
      : read.emphasis.state === "nothing_notable"
        ? EMPHASIS_EMPTY_COPY.nothingNotable
        : EMPHASIS_EMPTY_COPY.notRead)
}
```

Posture: `SourcePosture` union gains `"founder-authored"`; `sourcePostureForCitation` checks `tier === "founder_authored"` before the company-authored branch; `POSTURE_ORDER` becomes `["independent", "reporting", "founder-authored", "company-authored", "enrichment", "unknown"]`. In `lensSources`, `founder_authored` maps to sourceClass `"company"` (the three-class chip stays; a dedicated chip class is not in v1).

`api-contract.json`: version becomes `"2026-08-12.emphasis-read-v1"`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w @cold-start/extension -- investor-lens`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/api-contract.json apps/extension
git commit -m "feat: sixth lens category display model and contract bump"
```

---

### Task 9: Sixth filing card render

**Files:**
- Modify: `apps/extension/src/research/InvestorReadCard.tsx` (LensCategoryBody, line 233; the exhaustive never-check at line 314)
- Modify: `apps/extension/src/styles/research-trail.css`
- Test: `apps/extension/tests/investor-read-card.test.tsx` (extend)

**Interfaces:**
- Consumes: `read.emphasis`, `EMPHASIS_EMPTY_COPY`, `EMPHASIS_LABELS` from Task 8.
- Produces: rendered `section.cs-lens-emphasis[data-state]` inside the sixth category card. No new type roles or faces; reuses `cs-investor-read-claim`, `cs-investor-read-meta`, `cs-lens-none`.

- [ ] **Step 1: Write the failing tests**

Extend `apps/extension/tests/investor-read-card.test.tsx` (its fixtures already build `InvestorReadDisplay` objects; extend the fixture builder with an `emphasis` field defaulting to `not_read`):

```ts
it("renders the filed emphasis read with all four labeled lines", () => {
  // emphasis state "read". Open the pay-attention category (click its trigger).
  // Assert the Loud, Quiet, The read lines render with their <em> labels and texts,
  // and the Would change if meta line renders.
});

it("renders flat copy for thin_file", () => {
  // Assert exactly EMPHASIS_EMPTY_COPY.thinFile appears, no labels, no extra prose.
});

it("renders flat copy for nothing_notable and for a legacy not_read card", () => {});

it("always renders six category cards", () => {
  // screen.getAllByRole for the category triggers has length 6 in every state.
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w @cold-start/extension -- investor-read-card`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `LensCategoryBody`, convert the `learn-next` tail into an explicit branch and add before the exhaustive check:

```tsx
if (categoryId === "pay-attention") {
  const emphasis = read.emphasis;
  return (
    <section aria-label="Pay attention to" className="cs-lens-emphasis" data-state={emphasis.state}>
      {emphasis.state === "read" ? (
        <>
          <p className="cs-investor-read-claim"><em>{EMPHASIS_LABELS.loud}.</em> {emphasis.loud}</p>
          <p className="cs-investor-read-claim"><em>{EMPHASIS_LABELS.quiet}.</em> {emphasis.quiet}</p>
          <p className="cs-investor-read-claim"><em>{EMPHASIS_LABELS.read}.</em> {emphasis.read}</p>
          <p className="cs-investor-read-meta"><em>{EMPHASIS_LABELS.wouldChangeIf}</em> {emphasis.wouldChangeIf}</p>
        </>
      ) : (
        <p className="cs-lens-none">
          {emphasis.state === "thin_file"
            ? EMPHASIS_EMPTY_COPY.thinFile
            : emphasis.state === "nothing_notable"
              ? EMPHASIS_EMPTY_COPY.nothingNotable
              : EMPHASIS_EMPTY_COPY.notRead}
        </p>
      )}
    </section>
  );
}
```

Keep the `never` exhaustive check working for the updated union. CSS: `.cs-lens-emphasis` needs at most a small vertical rhythm rule in `research-trail.css` next to the other `cs-lens-*` sections; every color already routes through the shared claim/meta/none classes, so `audit:css` stays green with no new color literals.

- [ ] **Step 4: Run tests and the CSS audit**

Run: `npm test -w @cold-start/extension` (includes `audit:css` via the workspace test chain)
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/extension
git commit -m "feat: render Pay attention to as the sixth filing card"
```

---

### Task 10: Eval scorer extension

**Files:**
- Modify: `eval/investor-lens/score.mjs`
- Test: `eval/investor-lens/score.test.mjs` (extend)

**Interfaces:**
- Consumes: `card.synthesis.emphasisRead`.
- Produces: emphasis texts included in `genericPhraseCount`; new exported check `emphasisIsSpecificOrEmpty(card)`; both folded into `scoreInvestorLens`'s `checks`.

- [ ] **Step 1: Write the failing tests**

Extend `eval/investor-lens/score.test.mjs` (node:test style, matching the file):

```js
test("generic phrases inside the emphasis read count against the card", () => {
  // Card whose emphasisRead.read.text contains "well positioned".
  // genericPhraseCount(card) >= 1.
});

test("a pasted-anywhere emphasis read fails the specificity check", () => {
  // read.text "They emphasize growth while staying quiet on economics." with no digit,
  // no $ or %, and no company-name mention -> emphasisIsSpecificOrEmpty false, and
  // scoreInvestorLens(...).passed false.
});

test("a concrete emphasis read passes", () => {
  // read.text naming the company ("Acme's loudest proof is latency benchmarks...") passes.
});

test("empty states and legacy cards pass the specificity check", () => {
  // thin_file, nothing_notable, and absent field all return true.
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test eval/investor-lens/score.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `score.mjs`:

```js
function emphasisTexts(card) {
  const emphasis = card?.synthesis?.emphasisRead;
  if (!emphasis || emphasis.status !== "read") {
    return [];
  }
  return [text(emphasis.loud?.text), text(emphasis.read?.text)].filter(Boolean);
}
```

Fold `emphasisTexts(card)` into the `genericPhraseCount` haystack alongside `synthesisClaims`. Add:

```js
export function emphasisIsSpecificOrEmpty(card) {
  const emphasis = card?.synthesis?.emphasisRead;
  if (!emphasis || emphasis.status !== "read") {
    return true;
  }
  const readText = text(emphasis.read?.text);
  const companyName = text(card?.identity?.name?.value).toLowerCase();
  return /[\d$%]/.test(readText) ||
    (Boolean(companyName) && readText.toLowerCase().includes(companyName));
}
```

Add `emphasisSpecificOrEmpty: emphasisIsSpecificOrEmpty(extensionCard)` to `scoreInvestorLens`'s `checks` object (which already gates `passed` on every check).

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test eval/investor-lens/score.test.mjs` and `npm run test` at the root (the eval glob runs there)
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add eval
git commit -m "feat: eval gate for generic or unspecific emphasis reads"
```

---

### Task 11: Docs, env reference, and the full gate

**Files:**
- Modify: `CLAUDE.md`, `AGENTS.md` (module map: founder-voice lanes, emphasis step ids, `EMPHASIS_READ_ENABLED`, `XAI_API_KEY`; keep the two files in sync)
- Modify: `docs/anthropic-llm-call-map.md` (the `emphasis_read` stage row: model chain, label, where it runs)
- Modify: `docs/product/provider-cost-assumptions.md` (founderVoice lane costs and the <$0.10 budget)
- Modify: `README.md` (env-var reference: `XAI_API_KEY`, `EMPHASIS_READ_ENABLED`, `LLM_EMPHASIS_READ_MODEL`)

**Interfaces:**
- Consumes: everything shipped in Tasks 1-10.
- Produces: docs matched to the code; the full local gate green.

- [ ] **Step 1: Write the doc updates**

Each doc gets flat factual lines in the file's existing register (no headers-for-one-line, no em dashes). CLAUDE.md/AGENTS.md: extend the Investor Lens bullet with the sixth category and its module locations, add the founder-voice module family to the providers bullet, add the two step ids and two events to the background-work bullet, and the two env flags to the auth/env notes. Run `python3 ~/.claude/scripts/slopcheck.py` on each edited doc.

- [ ] **Step 2: Run the full gate**

```bash
cd .claude/worktrees/emphasis-read
docker-compose up -d postgres   # from the main checkout's compose file; the DB is shared on port 55432
npm run check
```

Expected: green end to end (lint, typecheck, tests, alpha-db and cards-db suites, build, Firefox build, eval dry-run, knip, secrets:check, audit:deps). Known worktree gotchas from memory: never pipe check through `tail` (it eats the exit code); knip may flag new provider exports if any are unconsumed, wire or trim them rather than suppressing.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md AGENTS.md docs README.md
git commit -m "docs: file the emphasis read module map and env reference"
```

---

### Task 12: Live QA and ship prep (needs Samay for deploy)

**Files:**
- No new files; operational verification.

- [ ] **Step 1: One live trace**

```bash
set -a; source .env.local; set +a
npm run trace:generation -- --domain cartesia.ai --mode analysis
```

Inspect the trace: `emphasis` block present, lane counts sane, one xAI call, total added cost under $0.10, and the stored card's `synthesis.emphasisRead` either a filed read or an honest empty state. Then run one quiet-company domain (glean.com) and confirm the thin-file or nothing_notable path with zero paid lane spend on thin_file.

- [ ] **Step 2: Panel check**

Load the rebuilt extension (`apps/extension/dist`) against local dev, open a profile with analysis, and confirm the sixth card renders in each reachable state. Screenshot for Samay's copy approval (the three empty-state strings and the four labels are his call).

- [ ] **Step 3: Ship checklist (blocked on Samay)**

- `XAI_API_KEY` into Vercel env (Production).
- Merge `emphasis-read` to main once Samay approves copy; deploy; extension rebuild ships under the bumped contract.
- Rollback lever: `EMPHASIS_READ_ENABLED=false` in Vercel, no deploy needed.

---

## Self-Review Notes

- Spec coverage: read shape (Task 1), empty states (Tasks 1, 2, 8, 9), label (Tasks 8, 9), memoized step placement and verify append (Tasks 6, 7), five evidence lanes (Tasks 3, 4), prompt spine (Task 5), verifier rules (Task 6), display always-present sixth slot (Tasks 8, 9), gates and rollback (Tasks 7, 12), eval scorer (Task 10), cost (Tasks 4, 12), tests list (spread across tasks), not-in-v1 items untouched.
- Deliberate deviations from the spec's letter, named: the HN lane reads the company's HN footprint by domain and Show HN register rather than by author, because founder HN usernames are not on the card; the by-author upgrade is a follow-on. The spec's "HN by author" live test proved the API, not a handle source.
- The `emphasis.started` event fires before the founder-voice fetch (not before synthesis), so the whisper only speaks when emphasis work actually starts.
- Empty-copy strings and the four line labels ship as working defaults and are flagged for Samay's approval in Task 12; the spec reserves final copy to him.
