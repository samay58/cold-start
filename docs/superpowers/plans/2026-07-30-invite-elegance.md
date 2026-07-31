# Invite Elegance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 90-character invite link with a short word-code link whose iMessage preview is a per-friend generated letterpress invitation card.

**Architecture:** Word codes and their acceptance pattern live in `packages/core`. Card image, slug, and ordinal live on the `alpha_invites` row (base64 text column) behind a new `/i/[slug]` page and `card.png` route. Card art is minted at invite time by `scripts/alpha-invite.ts` calling `google/gemini-3-pro-image` through OpenRouter with the checked-in style reference; the operator approves a candidate before the invite row exists. A global failure breaker guards redeem and inspect.

**Tech Stack:** Next.js 15 App Router, Drizzle + Neon HTTP, tsx operator scripts, OpenRouter image API, vitest + node:test.

**Spec:** `docs/superpowers/specs/2026-07-30-alpha-invite-elegance-design.md`. Read it first.

## Global Constraints

- Card and page copy: product name "Cold Start" only; never "friend alpha" on any user-facing artifact; no expiry date on the card; the number renders as "No [NN]", open-ended, never "of 12".
- Raw invite codes never touch server logs or the database; only SHA-256 hashes (existing `hashAlphaSecret`) are stored or compared.
- Legacy links (`/alpha#invite=<22-256 char token>`) keep working everywhere; the unified pattern is `/^[A-Za-z0-9_-]{14,256}$/`.
- Mint model is `google/gemini-3-pro-image` via OpenRouter, `OPENROUTER_API_KEY` from repo-root `.env.local`. Style reference: `docs/brand/invite-style-reference.png`.
- No new paid services, no Vercel Blob, no runtime image generation: the serving path only returns stored bytes.
- `packages/core/api-contract.json` does not change: no extension-facing route shapes change.
- The Neon HTTP driver has no transactions; any new write must be a single statement (this plan needs only single-statement writes).
- Failure breaker: 429 on redeem and inspect while the trailing 60 minutes hold >= 10 invalid-token attempts.
- Run `set -a; source .env.local; set +a` before any command that touches the local DB; `docker-compose up -d postgres` must be running for `test:alpha-db`.

---

### Task 1: Word-code module in core

**Files:**
- Create: `packages/core/src/invite-wordlist.ts` (generated once, checked in)
- Create: `packages/core/src/invite-codes.ts`
- Create: `packages/core/tests/invite-codes.test.ts`
- Modify: `packages/core/src/index.ts` (add exports)

**Interfaces:**
- Consumes: nothing.
- Produces: `INVITE_TOKEN_PATTERN: RegExp` (accepts legacy and word codes), `INVITE_WORDLIST: readonly string[]`, `generateInviteCode(): string` (three hyphen-joined words, e.g. `ember-quarto-lark`). Later tasks import all three from `@cold-start/core`.

- [x] **Step 1: Generate the word list from the EFF short wordlist 2.0**

The EFF short list 2.0 was built with unique three-character prefixes, public-vulgarity filtering, and 4+ character words, which gives prefix-freedom for free (spec's word-list requirements). Fetch and transform:

```bash
curl -s https://www.eff.org/files/2016/09/08/eff_short_wordlist_2_0.txt \
  | awk '{print $2}' \
  | grep -E '^[a-z]{4,8}$' \
  | sort -u \
  | node -e '
const words = require("fs").readFileSync(0, "utf8").trim().split("\n");
const out = `// Generated from the EFF short wordlist 2.0 (unique three-letter prefixes,\n// profanity-filtered upstream), filtered to 4-8 lowercase ascii letters.\n// Regenerate with the command in docs/superpowers/plans/2026-07-30-invite-elegance.md.\nexport const INVITE_WORDLIST = ${JSON.stringify(words, null, 0)} as const;\n`;
require("fs").writeFileSync("packages/core/src/invite-wordlist.ts", out);
console.log(words.length, "words");
' 
```

Expected: prints a count of roughly 1200 words (the list has 1296; a few fall to the length filter). If the count is below 1024, stop and widen the length filter to `{4,9}` instead of shipping a thin list.

- [x] **Step 2: Write the failing tests**

```typescript
// packages/core/tests/invite-codes.test.ts
import { describe, expect, it } from "vitest";
import {
  INVITE_TOKEN_PATTERN,
  INVITE_WORDLIST,
  generateInviteCode
} from "../src/invite-codes";

describe("INVITE_WORDLIST", () => {
  it("holds at least 1024 words of 4-8 lowercase letters", () => {
    expect(INVITE_WORDLIST.length).toBeGreaterThanOrEqual(1024);
    for (const word of INVITE_WORDLIST) {
      expect(word).toMatch(/^[a-z]{4,8}$/);
    }
  });

  it("is prefix-free: no word is a prefix of another", () => {
    const sorted = [...INVITE_WORDLIST].sort();
    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i].startsWith(sorted[i - 1])).toBe(false);
    }
  });
});

describe("generateInviteCode", () => {
  it("returns three distinct wordlist words joined by hyphens", () => {
    for (let i = 0; i < 200; i += 1) {
      const code = generateInviteCode();
      const words = code.split("-");
      expect(words).toHaveLength(3);
      expect(new Set(words).size).toBe(3);
      for (const word of words) {
        expect(INVITE_WORDLIST).toContain(word);
      }
      expect(code).toMatch(INVITE_TOKEN_PATTERN);
    }
  });
});

describe("INVITE_TOKEN_PATTERN", () => {
  it("accepts legacy 43-char base64url tokens", () => {
    expect("Xk3jP9qLm2vR8tYw4nZbF6hD1cAeG7sUoI5xKdMpQrE").toMatch(INVITE_TOKEN_PATTERN);
  });
  it("accepts word codes and rejects short garbage", () => {
    expect("ember-quarto-lark").toMatch(INVITE_TOKEN_PATTERN);
    expect("too-short").not.toMatch(INVITE_TOKEN_PATTERN);
    expect("has spaces in it here").not.toMatch(INVITE_TOKEN_PATTERN);
  });
});
```

- [x] **Step 3: Run tests to verify they fail**

Run: `npm test -w @cold-start/core -- invite-codes`
Expected: FAIL, cannot resolve `../src/invite-codes`.

- [x] **Step 4: Implement invite-codes.ts**

```typescript
// packages/core/src/invite-codes.ts
import { INVITE_WORDLIST } from "./invite-wordlist";

export { INVITE_WORDLIST };

// One pattern for both shapes: legacy 22+ char base64url secrets and new
// three-word codes (minimum 4+4+4 letters plus two hyphens = 14).
export const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{14,256}$/;

// Clean words can still combine badly (the what3words lesson). Screen the
// joined code, not the list.
const CODE_BLOCKLIST = /(kill|dead|hate|nazi|rape|bomb)/i;

function randomIndex(bound: number): number {
  // Rejection sampling over crypto randomness; works in Node and browsers.
  const limit = Math.floor(0xffffffff / bound) * bound;
  const buf = new Uint32Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(buf);
    if (buf[0] < limit) {
      return buf[0] % bound;
    }
  }
}

export function generateInviteCode(): string {
  for (;;) {
    const picked = new Set<number>();
    while (picked.size < 3) {
      picked.add(randomIndex(INVITE_WORDLIST.length));
    }
    const code = [...picked].map((i) => INVITE_WORDLIST[i]).join("-");
    if (!CODE_BLOCKLIST.test(code) && INVITE_TOKEN_PATTERN.test(code)) {
      return code;
    }
  }
}
```

- [x] **Step 5: Export from the package index**

In `packages/core/src/index.ts`, add alongside the existing exports:

```typescript
export { INVITE_TOKEN_PATTERN, INVITE_WORDLIST, generateInviteCode } from "./invite-codes";
```

- [x] **Step 6: Run tests to verify they pass**

Run: `npm test -w @cold-start/core -- invite-codes`
Expected: PASS.

- [x] **Step 7: Commit**

```bash
git add packages/core/src/invite-wordlist.ts packages/core/src/invite-codes.ts packages/core/tests/invite-codes.test.ts packages/core/src/index.ts
git commit -m "Add three-word invite codes and the unified token pattern to core"
```

---

### Task 2: Accept word codes at every entry point

**Files:**
- Modify: `apps/web/src/app/api/alpha/invite/invite-service.ts:11` (local `INVITE_TOKEN_PATTERN` const)
- Modify: `apps/web/src/app/alpha/alpha-invite.ts:12` (`inviteTokenFromHash`)
- Modify: `apps/web/src/app/alpha/page.tsx:16` (inline fragment-capture script literal)
- Modify: `apps/extension/src/shared/alpha-connect.ts:33` (`INVITE_TOKEN_PATTERN`)
- Test: `apps/web/tests/alpha-invite-route.test.ts` (extend), `apps/extension/tests/alpha-connect.test.tsx` (extend; find the exact file with `grep -rln "inviteTokenFromInput" apps/extension/tests`)

**Interfaces:**
- Consumes: `INVITE_TOKEN_PATTERN` from `@cold-start/core` (Task 1).
- Produces: nothing new; the four entry points now accept both token shapes.

- [x] **Step 1: Write the failing tests**

In `apps/web/tests/alpha-invite-route.test.ts`, add (mirroring how existing cases build request bodies in that file):

```typescript
it("accepts a three-word invite code in the redeem schema", () => {
  const parsed = alphaInviteRequestSchema.safeParse({ inviteToken: "ember-quarto-lark" });
  expect(parsed.success).toBe(true);
});

it("still accepts a legacy 43-char token", () => {
  const parsed = alphaInviteRequestSchema.safeParse({
    inviteToken: "Xk3jP9qLm2vR8tYw4nZbF6hD1cAeG7sUoI5xKdMpQrE"
  });
  expect(parsed.success).toBe(true);
});
```

In the extension test file that covers `inviteTokenFromInput`:

```typescript
it("accepts a bare word code and a full /i/ link", () => {
  expect(inviteTokenFromInput("ember-quarto-lark")).toBe("ember-quarto-lark");
  expect(
    inviteTokenFromInput("https://cold-start.semitechie.vc/i/dad#ember-quarto-lark")
  ).toBe("ember-quarto-lark");
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npm test -w web -- alpha-invite-route` and `npm test -w @cold-start/extension -- alpha-connect`
Expected: FAIL (14-char-minimum codes are rejected by the current `{22,256}` patterns).

- [x] **Step 3: Point all four entry points at the core pattern**

In `invite-service.ts`, delete the local const and import: `import { INVITE_TOKEN_PATTERN } from "@cold-start/core";`

In `alpha-invite.ts` (`inviteTokenFromHash`), same import, and replace the inline regex with the imported constant.

In `page.tsx`, the inline script must stay self-contained; interpolate the source:

```typescript
import { INVITE_TOKEN_PATTERN } from "@cold-start/core";

const fragmentCaptureScript = `
(() => {
  const raw = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  const token = raw.startsWith("invite=") ? new URLSearchParams(raw).get("invite") : raw;
  if (token && /${INVITE_TOKEN_PATTERN.source.replace(/\//g, "\\/")}/.test(token)) {
    window.sessionStorage.setItem(${JSON.stringify(ALPHA_INVITE_SESSION_KEY)}, token);
  }
  if (window.location.hash) {
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }
})();
`;
```

In `alpha-connect.ts`, the extension cannot import server code but CAN import core; replace the literal with `import { INVITE_TOKEN_PATTERN } from "@cold-start/core";` and keep the comment about mirroring the invite page.

- [x] **Step 4: Run tests to verify they pass**

Run: `npm test -w web -- alpha-invite-route && npm test -w @cold-start/extension -- alpha-connect`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add apps/web/src/app/api/alpha/invite/invite-service.ts apps/web/src/app/alpha/alpha-invite.ts apps/web/src/app/alpha/page.tsx apps/extension/src/shared/alpha-connect.ts apps/web/tests/alpha-invite-route.test.ts apps/extension/tests
git commit -m "Accept three-word invite codes at all four token entry points"
```

---

### Task 3: Invite card columns and repository functions

**Files:**
- Modify: `packages/db/src/schema.ts` (alpha_invites columns, new alpha_invite_attempts table)
- Create: next drizzle migration via `npm run db:generate` (0013 was the last committed at design time; take whatever number drizzle-kit assigns)
- Modify: `packages/db/src/repositories/alpha.ts` (`createAlphaInvite` input, new functions)
- Modify: `packages/db/src/index.ts` (re-export new functions)
- Test: the real-Postgres alpha suite; locate it with `grep -rln "createAlphaInvite" packages/db/tests` and extend that file.

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `createAlphaInvite` accepts optional `slug: string`, `displayName: string`, `ordinal: number`, `cardPngBase64: string`; `findAlphaInviteCardBySlug(db, slug): Promise<{ displayName: string | null; ordinal: number | null; cardPngBase64: string | null } | null>`; `nextAlphaInviteOrdinal(db): Promise<number>`; `recordAlphaInviteAttempt(db, now?): Promise<void>`; `countRecentAlphaInviteAttempts(db, since): Promise<number>`; `pruneAlphaInviteAttempts(db, before): Promise<number>`.

- [x] **Step 1: Add columns and table to schema.ts**

In the `alphaInvites` table definition, after `maxInstallations`:

```typescript
    slug: text("slug"),
    displayName: text("display_name"),
    ordinal: integer("ordinal"),
    cardPngBase64: text("card_png_base64"),
```

And in the table's index list: `uniqueIndex("alpha_invites_slug_idx").on(table.slug),`

New table alongside the other alpha tables:

```typescript
export const alphaInviteAttempts = pgTable(
  "alpha_invite_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [index("alpha_invite_attempts_created_idx").on(table.createdAt)]
);
```

- [x] **Step 2: Generate the migration**

Run: `npm run db:generate`
Expected: a new migration file appears under `packages/db/drizzle/` adding the four columns, the unique index, and the table. Read the SQL and confirm it contains no destructive statements.

- [x] **Step 3: Write the failing repository tests**

In the file found by `grep -rln "createAlphaInvite" packages/db/tests`, following its setup pattern:

```typescript
it("stores and finds the card by slug", async () => {
  const invite = await createAlphaInvite(db, {
    label: "Dad",
    tokenHash: sha256Of("ember-quarto-lark"),
    scopes: ["cards:read"],
    expiresAt: futureDate(),
    slug: "dad",
    displayName: "Dad",
    ordinal: 4,
    cardPngBase64: "aGVsbG8="
  });
  expect(invite.slug).toBe("dad");
  const card = await findAlphaInviteCardBySlug(db, "dad");
  expect(card).toEqual({ displayName: "Dad", ordinal: 4, cardPngBase64: "aGVsbG8=" });
  expect(await findAlphaInviteCardBySlug(db, "nobody")).toBeNull();
});

it("hands out the next ordinal", async () => {
  const before = await nextAlphaInviteOrdinal(db);
  await createAlphaInvite(db, {
    label: "x", tokenHash: sha256Of("x".repeat(20)), scopes: ["cards:read"],
    expiresAt: futureDate(), ordinal: before
  });
  expect(await nextAlphaInviteOrdinal(db)).toBe(before + 1);
});

it("counts and prunes invite attempts", async () => {
  await recordAlphaInviteAttempt(db);
  await recordAlphaInviteAttempt(db);
  const hourAgo = new Date(Date.now() - 3_600_000);
  expect(await countRecentAlphaInviteAttempts(db, hourAgo)).toBeGreaterThanOrEqual(2);
  const removed = await pruneAlphaInviteAttempts(db, new Date(Date.now() + 1000));
  expect(removed).toBeGreaterThanOrEqual(2);
});
```

Use that file's existing helpers for hashing and dates (`sha256Of`/`futureDate` stand for whatever the file already names them; match the local convention, do not invent new helpers if equivalents exist).

- [x] **Step 4: Run the suite to verify it fails**

Run: `docker-compose up -d postgres && set -a; source .env.local; set +a; npm run test:alpha-db`
Expected: FAIL on the new cases (functions not exported, columns unknown).

- [x] **Step 5: Implement repository changes**

In `createAlphaInvite`: extend the input type with the four optional fields and pass them through in `.values({...})` (`slug: input.slug ?? null` and so on). Add `slug`, `displayName`, `ordinal`, `cardPngBase64` to the `AlphaInvite` type and to `alphaInviteFromRow`.

New functions in `repositories/alpha.ts`:

```typescript
export async function findAlphaInviteCardBySlug(
  db: ColdStartDb,
  slug: string
): Promise<{ displayName: string | null; ordinal: number | null; cardPngBase64: string | null } | null> {
  const rows = await db
    .select({
      displayName: alphaInvites.displayName,
      ordinal: alphaInvites.ordinal,
      cardPngBase64: alphaInvites.cardPngBase64
    })
    .from(alphaInvites)
    .where(eq(alphaInvites.slug, slug))
    .limit(1);
  return rows[0] ?? null;
}

export async function nextAlphaInviteOrdinal(db: ColdStartDb): Promise<number> {
  const result = await db.execute<{ next: number | string | null }>(
    sql`select coalesce(max(ordinal), 0) + 1 as next from alpha_invites`
  );
  return Number(executeRows<{ next: number | string | null }>(result)[0]?.next ?? 1);
}

export async function recordAlphaInviteAttempt(db: ColdStartDb, now = new Date()): Promise<void> {
  await db.insert(alphaInviteAttempts).values({ createdAt: now });
}

export async function countRecentAlphaInviteAttempts(db: ColdStartDb, since: Date): Promise<number> {
  const result = await db.execute<{ count: number | string }>(
    sql`select count(*) as count from alpha_invite_attempts where created_at > ${since}`
  );
  return Number(executeRows<{ count: number | string }>(result)[0]?.count ?? 0);
}

export async function pruneAlphaInviteAttempts(db: ColdStartDb, before: Date): Promise<number> {
  const rows = await db
    .delete(alphaInviteAttempts)
    .where(sql`${alphaInviteAttempts.createdAt} < ${before}`)
    .returning({ id: alphaInviteAttempts.id });
  return rows.length;
}
```

(`executeRows` already exists in that file; `alphaInviteAttempts` comes from the schema import.) Re-export the new functions from `packages/db/src/index.ts` following the existing re-export style.

- [x] **Step 6: Apply the migration locally and run the suite**

Run: `set -a; source .env.local; set +a; npm run db:migrate && npm run test:alpha-db`
Expected: PASS.

- [x] **Step 7: Commit**

```bash
git add packages/db/src/schema.ts packages/db/drizzle packages/db/src/repositories/alpha.ts packages/db/src/index.ts packages/db/tests
git commit -m "Add invite card columns, slug lookup, ordinal, and attempt counters"
```

---

### Task 4: Failure breaker on inspect and redeem

**Files:**
- Modify: `apps/web/src/app/api/alpha/invite/invite-service.ts` (breaker helper)
- Modify: `apps/web/src/app/api/alpha/invite/inspect/route.ts` and `apps/web/src/app/api/alpha/invite/redeem/route.ts` (wire it; read both routes first to match their service-call shape)
- Modify: `scripts/alpha-prune.ts` (also prune attempts older than 24h)
- Test: `apps/web/tests/alpha-invite-route.test.ts` (extend)

**Interfaces:**
- Consumes: `recordAlphaInviteAttempt`, `countRecentAlphaInviteAttempts`, `pruneAlphaInviteAttempts` from Task 3.
- Produces: `alphaInviteBreakerOpen(db, now?): Promise<boolean>` and `recordInvalidInviteAttempt(db, now?): Promise<void>` in invite-service; both routes return `429 { error: "too_many_attempts" }` while the breaker is open.

- [x] **Step 1: Write the failing tests**

Following the existing test file's route-invocation pattern:

```typescript
it("opens the breaker after 10 invalid attempts in the window", async () => {
  for (let i = 0; i < 10; i += 1) {
    await recordInvalidInviteAttempt(db);
  }
  expect(await alphaInviteBreakerOpen(db)).toBe(true);
});

it("keeps the breaker closed for a quiet window", async () => {
  expect(await alphaInviteBreakerOpen(db)).toBe(false);
});
```

And one route-level case: an inspect request with an unknown (well-formed) token records an attempt; the same request repeated 10 times then answers 429.

- [x] **Step 2: Run to verify failure**

Run: `npm test -w web -- alpha-invite-route`
Expected: FAIL (functions do not exist).

- [x] **Step 3: Implement the breaker in invite-service.ts**

```typescript
const BREAKER_WINDOW_MS = 60 * 60 * 1000;
const BREAKER_THRESHOLD = 10;

export async function alphaInviteBreakerOpen(db: ColdStartDb, now = new Date()): Promise<boolean> {
  const since = new Date(now.getTime() - BREAKER_WINDOW_MS);
  return (await countRecentAlphaInviteAttempts(db, since)) >= BREAKER_THRESHOLD;
}

export async function recordInvalidInviteAttempt(db: ColdStartDb, now = new Date()): Promise<void> {
  await recordAlphaInviteAttempt(db, now);
}
```

Wire into both routes, before any hash lookup: if `await alphaInviteBreakerOpen(db)` then respond `429` with `{ error: "too_many_attempts" }`. After a lookup that yields `invalid_invite`, call `recordInvalidInviteAttempt(db)` before responding. Only `invalid_invite` records an attempt: expired, used, and revoked are legitimate friends holding real links, not guesses.

In `scripts/alpha-prune.ts`, alongside the existing event pruning, call `pruneAlphaInviteAttempts(db, dateBefore(now, "24h"))` and print the removed count in the same style the script already uses.

- [x] **Step 4: Run tests to verify they pass**

Run: `npm test -w web -- alpha-invite-route`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add apps/web/src/app/api/alpha/invite apps/web/tests/alpha-invite-route.test.ts scripts/alpha-prune.ts
git commit -m "Guard invite inspect and redeem with a global failure breaker"
```

---

### Task 5: The /i/[slug] page and card route

**Files:**
- Create: `apps/web/src/app/i/[slug]/page.tsx`
- Create: `apps/web/src/app/i/[slug]/card.png/route.ts`
- Modify: `apps/web/src/app/alpha/page.tsx` (extract the fragment script into a shared module)
- Create: `apps/web/src/app/alpha/fragment-capture.ts`
- Test: `apps/web/tests/invite-card-route.test.ts` (new; copy the harness style of the nearest existing route test)

**Interfaces:**
- Consumes: `findAlphaInviteCardBySlug` (Task 3), `AlphaInviteClient` and `ALPHA_INVITE_SESSION_KEY` (existing), `INVITE_TOKEN_PATTERN` (Task 1).
- Produces: public page `GET /i/{slug}` with OG metadata; public image `GET /i/{slug}/card.png`.

- [ ] **Step 1: Extract the fragment-capture script**

Move the `fragmentCaptureScript` template literal from `apps/web/src/app/alpha/page.tsx` into `apps/web/src/app/alpha/fragment-capture.ts` as `export function fragmentCaptureScript(): string` (with the Task 2 pattern interpolation inside). Import it from both `alpha/page.tsx` and the new `i/[slug]/page.tsx` so the two pages cannot drift.

- [ ] **Step 2: Write the failing card-route test**

```typescript
// apps/web/tests/invite-card-route.test.ts
import { describe, expect, it, vi } from "vitest";

describe("GET /i/[slug]/card.png", () => {
  it("serves stored bytes as an immutable png", async () => {
    // Follow the mocking approach of the neighboring route tests to stub
    // findAlphaInviteCardBySlug returning { cardPngBase64: base64Of("png-bytes"), ... }.
    const response = await GET(request("/i/dad/card.png"), { params: Promise.resolve({ slug: "dad" }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toContain("immutable");
  });

  it("404s an unknown slug", async () => {
    const response = await GET(request("/i/none/card.png"), { params: Promise.resolve({ slug: "none" }) });
    expect(response.status).toBe(404);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm test -w web -- invite-card-route`
Expected: FAIL (route module does not exist).

- [ ] **Step 4: Implement the route**

```typescript
// apps/web/src/app/i/[slug]/card.png/route.ts
import { NextRequest } from "next/server";
import { findAlphaInviteCardBySlug } from "@cold-start/db";
import { getDb } from "../../../../lib/db"; // match however neighboring routes obtain the db

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,64}$/.test(slug)) {
    return new Response("not found", { status: 404 });
  }
  const card = await findAlphaInviteCardBySlug(getDb(), slug);
  if (!card?.cardPngBase64) {
    return new Response("not found", { status: 404 });
  }
  return new Response(Buffer.from(card.cardPngBase64, "base64"), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable"
    }
  });
}
```

(Check how the alpha routes construct their db handle and copy that exactly; the import path above is a stand-in for whatever `grep -rn "getDb\|createDb" apps/web/src/app/api/alpha/invite/inspect/route.ts` shows.)

- [ ] **Step 5: Implement the page**

```tsx
// apps/web/src/app/i/[slug]/page.tsx
import type { Metadata } from "next";
import React from "react";
import { notFound } from "next/navigation";
import { findAlphaInviteCardBySlug } from "@cold-start/db";
import { AlphaInviteClient } from "../../alpha/AlphaInviteClient";
import { fragmentCaptureScript } from "../../alpha/fragment-capture";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const card = await findAlphaInviteCardBySlug(getDb(), slug);
  if (!card) {
    return { title: "Cold Start" };
  }
  const origin = process.env.NEXT_PUBLIC_WEB_ORIGIN?.trim() || "https://cold-start.semitechie.vc";
  return {
    title: `Invitation, for ${card.displayName ?? "you"}`,
    description: "Cold Start",
    openGraph: {
      title: `Invitation, for ${card.displayName ?? "you"}`,
      description: "Cold Start",
      images: [{ url: `${origin}/i/${slug}/card.png` }]
    }
  };
}

export default async function InvitePage({ params }: PageProps) {
  const { slug } = await params;
  const card = await findAlphaInviteCardBySlug(getDb(), slug);
  if (!card) {
    notFound();
  }
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: fragmentCaptureScript() }} />
      {/* The card, then the same ceremony /alpha runs. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/i/${slug}/card.png`} alt={`Invitation for ${card.displayName ?? "you"}`} style={{ maxWidth: "100%" }} />
      <AlphaInviteClient
        extensionId={process.env.CHROME_EXTENSION_ID?.trim() ?? ""}
        storeUrl={process.env.CHROME_WEB_STORE_URL?.trim() ?? "https://chromewebstore.google.com/"}
      />
    </>
  );
}
```

Layout polish beyond this skeleton belongs to a later design pass; this task's bar is a working page whose preview card, title, and ceremony are correct. Match `AlphaInviteClient` prop usage exactly to `alpha/page.tsx`.

- [ ] **Step 6: Run tests and typecheck**

Run: `npm test -w web -- invite-card-route && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/i apps/web/src/app/alpha/page.tsx apps/web/src/app/alpha/fragment-capture.ts apps/web/tests/invite-card-route.test.ts
git commit -m "Serve the personalized invitation page and card image at /i/[slug]"
```

---

### Task 6: The mint pipeline in alpha:invite

**Files:**
- Create: `scripts/alpha-mint-card.ts`
- Modify: `scripts/alpha-invite.ts` (mint flow, new flags, new link/snippet output)
- Modify: `scripts/alpha-common.ts` (`inviteUrl` gains slug shape; add `slugify`)
- Test: `scripts/alpha-operator.test.ts` (extend; pure units only, no network, no DB)
- Modify: `CLAUDE.md` and `AGENTS.md` (the one-line `alpha:invite` description)

**Interfaces:**
- Consumes: `generateInviteCode` (Task 1), `createAlphaInvite` with card fields and `nextAlphaInviteOrdinal` (Task 3).
- Produces: `buildMintPrompt(name: string, ordinal: number): string`, `imagesFromOpenRouterResponse(body: unknown): string[]` (base64 payloads), `mintInviteCandidates(input: { name: string; ordinal: number; referencePath: string; outDir: string }): Promise<string[]>` (saved file paths), `slugify(name: string): string`, `inviteUrl(slug: string, code: string, origin?: string): string`.

- [ ] **Step 1: Write the failing unit tests**

In `scripts/alpha-operator.test.ts` (node:test conventions, matching the file):

```typescript
test("buildMintPrompt carries name, number, and the copy law", () => {
  const prompt = buildMintPrompt("Dad", 4);
  assert.match(prompt, /Invitation, for Dad/);
  assert.match(prompt, /No 04/);
  assert.doesNotMatch(prompt, /friend alpha/i);
  assert.doesNotMatch(prompt, /valid|expir/i);
});

test("imagesFromOpenRouterResponse extracts base64 payloads", () => {
  const body = {
    choices: [{ message: { images: [
      { image_url: { url: "data:image/png;base64,aGVsbG8=" } }
    ] } }]
  };
  assert.deepEqual(imagesFromOpenRouterResponse(body), ["aGVsbG8="]);
  assert.deepEqual(imagesFromOpenRouterResponse({}), []);
});

test("slugify derives clean slugs", () => {
  assert.equal(slugify("Dad"), "dad");
  assert.equal(slugify("Priya S."), "priya-s");
});

test("inviteUrl builds the /i/ link with the code in the fragment", () => {
  assert.equal(
    inviteUrl("dad", "ember-quarto-lark", "https://cold-start.semitechie.vc"),
    "https://cold-start.semitechie.vc/i/dad#ember-quarto-lark"
  );
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run alpha:test`
Expected: FAIL (functions missing).

- [ ] **Step 3: Implement alpha-mint-card.ts**

```typescript
// scripts/alpha-mint-card.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MODEL = "google/gemini-3-pro-image";

export function buildMintPrompt(name: string, ordinal: number): string {
  const number = String(ordinal).padStart(2, "0");
  return [
    "Keep this exact card: same handmade cream paper, same deckle edge, same violet wax seal",
    "with CS at lower right, same lighting and composition.",
    `The letterpress line reads "Invitation, for ${name}", pressed visibly into the paper,`,
    "ink dark and matte.",
    `A smaller letterpress "No ${number}" sits quietly in the top right corner.`,
    '"Cold Start" stays small at lower left.',
    "Nothing else is printed on the card."
  ].join(" ");
}

export function imagesFromOpenRouterResponse(body: unknown): string[] {
  const images = (body as { choices?: { message?: { images?: { image_url?: { url?: string } }[] } }[] })
    ?.choices?.[0]?.message?.images;
  if (!Array.isArray(images)) {
    return [];
  }
  return images
    .map((image) => image?.image_url?.url ?? "")
    .filter((url) => url.startsWith("data:image/"))
    .map((url) => url.split(",", 2)[1] ?? "")
    .filter(Boolean);
}

export async function mintInviteCandidates(input: {
  name: string;
  ordinal: number;
  referencePath: string;
  outDir: string;
}): Promise<string[]> {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) {
    throw new Error("OPENROUTER_API_KEY is missing; add it to .env.local.");
  }
  const reference = readFileSync(input.referencePath).toString("base64");
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      modalities: ["image", "text"],
      usage: { include: true },
      messages: [{
        role: "user",
        content: [
          { type: "text", text: buildMintPrompt(input.name, input.ordinal) },
          { type: "image_url", image_url: { url: `data:image/png;base64,${reference}` } }
        ]
      }]
    })
  });
  if (!response.ok) {
    throw new Error(`OpenRouter mint failed: ${response.status} ${await response.text()}`);
  }
  const body = await response.json();
  const images = imagesFromOpenRouterResponse(body);
  if (images.length === 0) {
    throw new Error("Mint returned no images; re-run or adjust the reference.");
  }
  mkdirSync(input.outDir, { recursive: true });
  return images.map((b64, index) => {
    const path = join(input.outDir, `candidate-${index + 1}.png`);
    writeFileSync(path, Buffer.from(b64, "base64"));
    return path;
  });
}
```

- [ ] **Step 4: Add slugify and the new inviteUrl to alpha-common.ts**

```typescript
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function inviteUrl(slug: string, code: string, origin = process.env.ALPHA_INVITE_ORIGIN): string {
  const normalizedOrigin = (origin?.trim() || DEFAULT_INVITE_ORIGIN).replace(/\/+$/, "");
  const url = new URL(`/i/${slug}`, normalizedOrigin);
  url.hash = code;
  return url.toString();
}
```

Update `inviteUrl`'s existing call sites in `scripts/` to the new signature (find them: `grep -rn "inviteUrl(" scripts/`).

- [ ] **Step 5: Rework alpha-invite.ts around the mint loop**

New flags: `--name <name>` (defaults to `--label`), `--skip-card` (mint nothing, legacy behavior). Flow after argument parsing, before the DB write:

```typescript
const name = valueFor(args, "--name") ?? label;
const code = generateInviteCode();
const slugBase = slugify(name);

loadProductionEnv();
loadEnvFile(resolve(process.cwd(), ".env.local")); // OPENROUTER_API_KEY lives here, not in the prod env file

const ordinal = await withAlphaDb((db) => nextAlphaInviteOrdinal(db));
let cardPngBase64: string | undefined;
let slug: string | undefined;

if (!hasFlag(args, "--skip-card")) {
  const outDir = resolve(process.cwd(), ".cold-start", "invites", `${slugBase}-${ordinal}`);
  const candidates = await mintInviteCandidates({
    name,
    ordinal,
    referencePath: resolve(process.cwd(), "docs/brand/invite-style-reference.png"),
    outDir
  });
  execSync(`open ${JSON.stringify(outDir)}`);
  const choice = await promptOperator(
    `Candidates in ${outDir}. Approve [1-${candidates.length}], r to re-roll, s to skip the card: `
  );
  // "r" loops back to mintInviteCandidates; "s" leaves cardPngBase64 undefined;
  // a number approves. Loop until approval or skip.
  const approved = candidates[Number(choice) - 1];
  execSync(`sips --resampleWidth 2400 ${JSON.stringify(approved)}`);
  cardPngBase64 = readFileSync(approved).toString("base64");
  slug = slugBase;
}
```

`promptOperator` is a small readline helper in `alpha-invite.ts` (`readline/promises`' `rl.question`, close after). Implement the re-roll loop for real: `for (;;) { ... if (choice === "r") { candidates = await mintInviteCandidates(...); continue; } ... }`. On slug collision (`createAlphaInvite` throwing on the unique index), retry once with `${slugBase}-${ordinal}` as the slug.

Then pass `slug`, `displayName: name`, `ordinal`, `cardPngBase64` into the existing `createAlphaInvite` call (token hashing unchanged: `tokenHash: sha256(code)`).

Output block replaces the current URL print:

```typescript
console.log(`Invitation ${invite.id} created for ${invite.label}. No ${String(ordinal).padStart(2, "0")}.`);
console.log(`Expires: ${invite.expiresAt.toISOString()}`);
console.log("");
console.log("Send this as its own iMessage bubble (the card preview replaces the URL):");
console.log(slug ? inviteUrl(slug, code) : legacyInviteUrl(code));
console.log("");
console.log(`If they ever need to type it, the key is: ${code}`);
```

(Keep a `legacyInviteUrl` wrapper producing the old `/alpha#invite=` shape for `--skip-card` so nothing regresses.)

- [ ] **Step 6: Run the unit tests**

Run: `npm run alpha:test`
Expected: PASS.

- [ ] **Step 7: Update CLAUDE.md and AGENTS.md**

In both files, update the `alpha:invite` line to: `npm run alpha:invite # tsx scripts/alpha-invite.ts (mint a personalized invitation card via OpenRouter, approve it, create the invite; prints the /i/ link and word code; --skip-card for the legacy flow)`.

- [ ] **Step 8: Commit**

```bash
git add scripts/alpha-mint-card.ts scripts/alpha-invite.ts scripts/alpha-common.ts scripts/alpha-operator.test.ts CLAUDE.md AGENTS.md
git commit -m "Mint the letterpress invitation card inside alpha:invite"
```

---

### Task 7: Full gate and production migration

**Files:**
- None new; this task proves the whole change.

- [ ] **Step 1: Run the full local gate**

Run: `docker-compose up -d postgres && npm run check`
Expected: green end to end (lint, typecheck, tests, both real-DB suites, builds, firefox build, eval dry-run, knip, secrets, audit). Fix anything it surfaces before proceeding; do not pipe check through tail (it eats the exit code).

- [ ] **Step 2: Apply the migration to production**

Run: `npm run db:migrate:production`
Expected: the new migration applies cleanly. This is the step the 5/29 outage memory exists for: Vercel deploys do not run Neon migrations, so this must happen before the deploy that ships the new columns' readers.

- [ ] **Step 3: Deploy and smoke**

Deploy via the normal Vercel flow. Then mint a real test invite (`npm run alpha:invite -- --label "smoke-test" --name "Sam"`), open the printed `/i/` link in a browser, confirm the card renders and the page offers the ceremony, text the link to yourself and confirm the iMessage preview shows the card full-bleed, then delete the tester (`npm run alpha:delete-tester`).

- [ ] **Step 4: Commit any smoke fixes and push**

```bash
git push origin main
```

---

### Task 8: Kamya's invitation and the handoff walkthrough

Added mid-execution at Samay's request (2026-07-30). Runs only after Task 7 is fully done (prod migrated, deployed, smoke-tested): minting writes a real invite row to the production database.

- [ ] **Step 1: Mint Kamya's invitation, extra special**

Run: `npm run alpha:invite -- --label "Kamya" --name "Kamya"`

Extra special within the settled design (no new motifs, no copy changes): take the craft up through the approval loop, not the card's content. Re-roll at least once so the pick is from 4+ candidates, and approve only a flawless render: letterpress line crisp, name perfectly spelled, seal clean. If the ordinal counter is still fresh enough that No 01 is available, hers is No 01.

- [ ] **Step 2: Hand Samay the send steps**

Print/report: the `/i/kamya` link to send as its own iMessage bubble (the card preview replaces the URL only when the link is the entire message), the spoken word code on a separate line as the fallback, and a reminder to check the preview renders full-bleed before considering it sent.

- [ ] **Step 3: The walkthrough**

Close with a plain-English walkthrough for Samay (say-less + caveman register, per his standing instructions): what was built step by step, what changed where, why it is verified polished (which gates ran, what they prove), and the exact steps for Kamya to test it and give feedback.

---

## Execution Deviations

- Task 1: the `{4,8}` length filter yielded 943 words, under the 1024 floor; widened to `{4,9}` per this plan's own contingency, giving 1165 words. The wordlist test asserts `/^[a-z]{4,9}$/` accordingly.
- Task 1: `packages/core/src/index.ts` uses `export * from "./invite-codes";` (the file's uniform star-export convention) instead of the plan's named-export line.
- Task 3: drizzle-kit numbered the migration 0014 (`0014_gorgeous_typhoid_mary.sql`); additive only. `packages/db/src/index.ts` needed no change: it already star-exports `./repositories/alpha`.
- General: the web workspace is addressed as `-w @cold-start/web`, not the plan's `-w web`; the extension token-input test file is `apps/extension/tests/alpha-connect.test.ts` (`.ts`, not `.tsx`).

## Self-Review Notes

- Spec coverage: link shape (Tasks 1, 2, 6), card generation and approval (Task 6), storage and serving (Tasks 3, 5), landing page (Task 5), failure breaker (Task 4), copy law (Global Constraints + Task 6 prompt test), legacy compatibility (Tasks 1, 2, 6), production rollout (Task 7). The landing page's seal-impression motion moment is deliberately deferred to a design pass after the flow works; the spec's core promise (card preview, short link, working ceremony) is fully covered.
- The two repo-lookup steps (`grep` for the db test file and the db-handle import) are discovery commands with exact patterns, not placeholders: the file names vary by suite and the plan pins how to find them.
- Type consistency: `findAlphaInviteCardBySlug`, `nextAlphaInviteOrdinal`, `recordAlphaInviteAttempt`, `countRecentAlphaInviteAttempts`, `pruneAlphaInviteAttempts`, `generateInviteCode`, `INVITE_TOKEN_PATTERN`, `buildMintPrompt`, `imagesFromOpenRouterResponse`, `mintInviteCandidates`, `slugify`, `inviteUrl(slug, code, origin?)` are named identically at definition and every use site above.
