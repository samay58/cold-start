# Cold Start Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Cold Start MVP: a sourced company context card at `/c/{slug}`, a gated Chrome side panel with synthesis, and the backend pipeline that generates, validates, caches, and serves cards.

**Architecture:** Use an npm workspace monorepo with one Next.js app, one Chrome MV3 extension, and focused packages for schema, data providers, storage, pipeline logic, LLM calls, and shared card UI. The public web route always strips synthesis; the extension route returns synthesis only after extension-origin validation. Inngest owns long-running generation, while the request path only checks cache state or dispatches work.

**Tech Stack:** Next.js 15 App Router, React, TypeScript, npm workspaces, Vitest, Playwright, Drizzle ORM, Neon Postgres, Inngest, Anthropic Messages API, AgentCash stableenrich endpoints, MV3 Side Panel API, Vite, CRXJS, Tailwind v4, Zod.

---

## Source Documents And External Docs Checked

Repo source of truth:
- `README.md`
- `SPEC.md`
- `DESIGN.md`

External primary docs checked on 2026-05-06:
- Next.js 15 PPR: https://nextjs.org/docs/15/app/getting-started/partial-prerendering
- Next.js App Router: https://nextjs.org/docs/app
- Inngest Next.js serve handler: https://www.inngest.com/docs/learn/serving-inngest-functions
- Chrome Side Panel API: https://developer.chrome.com/docs/extensions/reference/sidePanel/
- CRXJS manifest config: https://crxjs.dev/concepts/manifest/
- Drizzle Neon guide: https://orm.drizzle.team/docs/get-started/neon-new
- Neon serverless driver: https://neon.com/docs/serverless/serverless-driver
- Vercel OG image generation: https://vercel.com/docs/functions/og-image-generation
- Anthropic prompt caching: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
- Anthropic tool use: https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/implement-tool-use

Important doc-driven constraints:
- Next.js PPR is still experimental in the checked docs, so the app opts into `experimental.ppr = "incremental"` and route-level `experimental_ppr = true` only where useful.
- Inngest App Router handlers must export `GET`, `POST`, and `PUT` from `serve()`.
- `chrome.sidePanel.open()` may only be called from a user action. The extension background handler must open the side panel before awaiting tab metadata or backend calls.
- CRXJS manifest paths resolve from the Vite project root. Do not use absolute paths or `./src/...` manifest paths.
- Neon HTTP is the right default for one-shot serverless queries; WebSockets are only needed for interactive transactions.
- Next App Router can generate OG images through `ImageResponse` from `next/og`.
- Anthropic prompt caching works best when static tools, schemas, and instructions come before variable company evidence.

## Scope Check

This spec covers four subsystems: backend pipeline, public web card, Chrome extension, and launch hardening. They are coupled by the card schema, so this file is a master plan, but implementation must stay phase-gated:

- Week 1 produces a working backend and cacheable card generation path.
- Week 2 produces a public `/c/{slug}` web card with no synthesis leakage.
- Week 3 produces the Chrome extension and launch gate.

Do not start Week 2 until the Week 1 checkpoint passes. Do not start Week 3 until the public route demonstrably strips synthesis.

## File Structure

Create this structure:

```text
cold-start/
  package.json
  package-lock.json
  tsconfig.base.json
  vitest.workspace.ts
  .env.example
  .gitignore
  docs/
    superpowers/
      plans/
        2026-05-06-cold-start-implementation.md
  apps/
    web/
      package.json
      next.config.ts
      postcss.config.mjs
      tsconfig.json
      src/
        app/
          globals.css
          layout.tsx
          page.tsx
          c/[slug]/page.tsx
          c/[slug]/loading.tsx
          c/[slug]/opengraph-image.tsx
          api/cards/[slug]/route.ts
          api/extension/cards/[slug]/route.ts
          api/generate/route.ts
          api/inngest/route.ts
          privacy/page.tsx
        inngest/
          client.ts
          functions.ts
        lib/
          env.ts
          extension-auth.ts
    extension/
      package.json
      tsconfig.json
      vite.config.ts
      manifest.config.ts
      index.html
      sidepanel.html
      src/
        background.ts
        sidepanel.tsx
        domain.ts
        styles.css
      tests/
        domain.test.ts
  packages/
    core/
      package.json
      tsconfig.json
      src/
        card.ts
        trust.ts
        slug.ts
        index.ts
      tests/
        trust.test.ts
        slug.test.ts
    db/
      package.json
      tsconfig.json
      drizzle.config.ts
      src/
        client.ts
        schema.ts
        repository.ts
        index.ts
      tests/
        schema.test.ts
    providers/
      package.json
      tsconfig.json
      src/
        agentcash.ts
        stableenrich.ts
        direct-fallback.ts
        types.ts
        index.ts
      scripts/
        spike-stableenrich.ts
      tests/
        stableenrich.test.ts
    llm/
      package.json
      tsconfig.json
      src/
        anthropic.ts
        extraction.ts
        synthesis.ts
        verifier.ts
        index.ts
      tests/
        extraction.test.ts
        verifier.test.ts
    pipeline/
      package.json
      tsconfig.json
      src/
        generate-card.ts
        resolve-identity.ts
        conflict-resolution.ts
        cost.ts
        index.ts
      tests/
        generate-card.test.ts
        conflict-resolution.test.ts
    ui/
      package.json
      tsconfig.json
      src/
        CardShell.tsx
        CitationMarker.tsx
        FactRow.tsx
        SourceDrawer.tsx
        SynthesisSection.tsx
        tokens.css
        index.ts
      tests/
        CardShell.test.tsx
  eval/
    golden-companies.seed.json
    README.md
    promptfoo.config.yaml
```

Responsibility boundaries:

- `packages/core`: canonical card types, Zod validation, slugging, public/private redaction, trust rules. It has no network or database imports.
- `packages/db`: Drizzle schema and repository functions. It has no provider or LLM imports.
- `packages/providers`: AgentCash stableenrich and direct-provider fallback wrappers. It has no model logic.
- `packages/llm`: Anthropic prompt construction, tool-schema calls, synthesis, verifier parsing. It receives evidence and returns typed structures.
- `packages/pipeline`: orchestration. It imports core, db, providers, and llm.
- `packages/ui`: shared presentational React components. It receives a `ColdStartCard` and never fetches data.
- `apps/web`: request routing, Inngest serve handler, public pages, extension-only API.
- `apps/extension`: browser activation, side panel shell, tab URL capture, extension API calls.
- `eval`: golden company set and regression harness.

## Week 1 Checkpoint

Week 1 is complete only when all are true:

- `npm test --workspaces --if-present` passes.
- `npm run typecheck --workspaces --if-present` passes.
- Stableenrich spike records pass/fail for Exa search, Exa findSimilar, Firecrawl, org enrichment, and LinkedIn enrichment.
- Generating a card for `cartesia.ai` writes `cards`, `claims`, `citations`, and `sources` rows.
- Any generated `ResolvedFact` without citations is stored as `value: null`, `status: "unknown"`.
- The synthesis verifier drops unsupported or contradicted claims.

## Week 2 Checkpoint

Week 2 is complete only when all are true:

- Public `GET /api/cards/cartesia` returns no `synthesis` key.
- Public `/c/cartesia` renders identity, funding, team, signals, comparables, and citation drawer.
- Citation markers resolve to existing citation IDs.
- OG image route renders a 1200 by 630 image and does not use dark mode.
- Playwright confirms the web page renders at 390px mobile and 1280px desktop without text overlap.

## Week 3 Checkpoint

Week 3 is complete only when all are true:

- Clicking the extension action opens the side panel synchronously.
- Extension side panel captures the active tab domain and calls the extension API.
- Side panel renders synthesis, while the public page for the same slug still omits synthesis.
- Manifest permissions are only `sidePanel`, `activeTab`, `scripting`, and `storage`.
- Privacy page describes data use without claiming contact scraping, outbound, CRM, or investment advice.

---

### Task 1: Workspace Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `vitest.workspace.ts`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/index.ts`
- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`
- Create: `packages/db/src/index.ts`
- Create: `packages/providers/package.json`
- Create: `packages/providers/tsconfig.json`
- Create: `packages/providers/src/index.ts`
- Create: `packages/llm/package.json`
- Create: `packages/llm/tsconfig.json`
- Create: `packages/llm/src/index.ts`
- Create: `packages/pipeline/package.json`
- Create: `packages/pipeline/tsconfig.json`
- Create: `packages/pipeline/src/index.ts`
- Create: `packages/ui/package.json`
- Create: `packages/ui/tsconfig.json`
- Create: `packages/ui/src/index.ts`
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/extension/package.json`
- Create: `apps/extension/tsconfig.json`

- [ ] **Step 1: Write failing workspace smoke test**

Create `packages/core/tests/slug.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { companySlugFromDomain } from "../src/index";

describe("companySlugFromDomain", () => {
  it("normalizes a company domain into a stable slug", () => {
    expect(companySlugFromDomain("https://www.Cartesia.ai/about")).toBe("cartesia");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspaces --if-present`

Expected: FAIL with an npm workspace or module resolution error because `package.json` and package files do not exist yet.

- [ ] **Step 3: Create root workspace files**

Create `package.json`:

```json
{
  "name": "cold-start",
  "version": "0.1.0",
  "private": true,
  "packageManager": "npm@10.9.0",
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "dev": "npm run dev -w @cold-start/web",
    "dev:extension": "npm run dev -w @cold-start/extension",
    "build": "npm run build --workspaces --if-present",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "test": "npm run test --workspaces --if-present",
    "lint": "npm run lint --workspaces --if-present",
    "db:generate": "npm run db:generate -w @cold-start/db",
    "db:migrate": "npm run db:migrate -w @cold-start/db"
  },
  "devDependencies": {
    "@types/node": "^22.15.0",
    "tsx": "^4.20.0",
    "typescript": "^5.9.0",
    "vitest": "^3.2.0"
  }
}
```

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "baseUrl": ".",
    "paths": {
      "@cold-start/core": ["packages/core/src/index.ts"],
      "@cold-start/db": ["packages/db/src/index.ts"],
      "@cold-start/providers": ["packages/providers/src/index.ts"],
      "@cold-start/llm": ["packages/llm/src/index.ts"],
      "@cold-start/pipeline": ["packages/pipeline/src/index.ts"],
      "@cold-start/ui": ["packages/ui/src/index.ts"]
    }
  }
}
```

Create `vitest.workspace.ts`:

```typescript
import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "packages/*",
  "apps/extension"
]);
```

Create `.gitignore`:

```gitignore
node_modules/
.next/
dist/
coverage/
.env
.env.local
.env.*.local
*.tsbuildinfo
drizzle/
playwright-report/
test-results/
```

Create `.env.example`:

```bash
DATABASE_URL=postgres://coldstart:local@localhost:5432/coldstart
ANTHROPIC_API_KEY=sk-ant-example
ANTHROPIC_MODEL=claude-sonnet-4-6
AGENTCASH_API_KEY=agentcash_example
STABLEENRICH_EXA_SEARCH_URL=https://stableenrich.example/agentcash/exa/search
STABLEENRICH_EXA_SIMILAR_URL=https://stableenrich.example/agentcash/exa/find-similar
STABLEENRICH_FIRECRAWL_URL=https://stableenrich.example/agentcash/firecrawl/scrape
STABLEENRICH_ORG_ENRICH_URL=https://stableenrich.example/agentcash/enrich/org
STABLEENRICH_LINKEDIN_URL=https://stableenrich.example/agentcash/linkedin/company
DIRECT_EXA_API_KEY=
DIRECT_FIRECRAWL_API_KEY=
DIRECT_PDL_API_KEY=
NEXT_PUBLIC_WEB_ORIGIN=http://localhost:3000
CHROME_EXTENSION_ID=local-dev
ALLOWED_EXTENSION_ORIGINS=chrome-extension://local-dev,http://localhost:5173
INNGEST_EVENT_KEY=local-event-key
INNGEST_SIGNING_KEY=local-signing-key
```

- [ ] **Step 4: Create package files**

Create `packages/core/package.json`:

```json
{
  "name": "@cold-start/core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "vitest": "^3.2.0"
  }
}
```

Create `packages/core/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "tests"]
}
```

Create `packages/core/src/index.ts`:

```typescript
export function companySlugFromDomain(input: string): string {
  const url = input.startsWith("http") ? new URL(input) : new URL(`https://${input}`);
  const host = url.hostname.replace(/^www\./, "");
  return host.split(".")[0]?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") ?? "unknown";
}
```

Create `packages/db/package.json`:

```json
{
  "name": "@cold-start/db",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate"
  },
  "dependencies": {
    "@cold-start/core": "file:../core",
    "@neondatabase/serverless": "^1.0.0",
    "drizzle-orm": "^0.44.0",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "drizzle-kit": "^0.31.0",
    "vitest": "^3.2.0"
  }
}
```

Create `packages/db/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "tests", "drizzle.config.ts"]
}
```

Create `packages/db/src/index.ts`:

```typescript
export const dbPackageReady = true;
```

Create `packages/providers/package.json`:

```json
{
  "name": "@cold-start/providers",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "spike:stableenrich": "tsx scripts/spike-stableenrich.ts"
  },
  "dependencies": {
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "tsx": "^4.20.0",
    "vitest": "^3.2.0"
  }
}
```

Create `packages/providers/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "tests", "scripts"]
}
```

Create `packages/providers/src/index.ts`:

```typescript
export const providersPackageReady = true;
```

Create `packages/llm/package.json`:

```json
{
  "name": "@cold-start/llm",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.60.0",
    "@cold-start/core": "file:../core",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "vitest": "^3.2.0"
  }
}
```

Create `packages/llm/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "tests"]
}
```

Create `packages/llm/src/index.ts`:

```typescript
export const llmPackageReady = true;
```

Create `packages/pipeline/package.json`:

```json
{
  "name": "@cold-start/pipeline",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "vitest run --environment jsdom",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@cold-start/core": "file:../core",
    "@cold-start/db": "file:../db",
    "@cold-start/llm": "file:../llm",
    "@cold-start/providers": "file:../providers",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "vitest": "^3.2.0"
  }
}
```

Create `packages/pipeline/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "tests"]
}
```

Create `packages/pipeline/src/index.ts`:

```typescript
export const pipelinePackageReady = true;
```

Create `packages/ui/package.json`:

```json
{
  "name": "@cold-start/ui",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./tokens.css": "./src/tokens.css"
  },
  "scripts": {
    "test": "vitest run --environment jsdom",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@cold-start/core": "file:../core",
    "react": "^19.1.0",
    "react-dom": "^19.1.0"
  },
  "devDependencies": {
    "@testing-library/react": "^16.3.0",
    "@types/react": "^19.1.0",
    "@types/react-dom": "^19.1.0",
    "jsdom": "^26.1.0",
    "vitest": "^3.2.0"
  }
}
```

Create `packages/ui/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx"
  },
  "include": ["src", "tests"]
}
```

Create `packages/ui/src/index.ts`:

```typescript
export const uiPackageReady = true;
```

Create `apps/web/package.json`:

```json
{
  "name": "@cold-start/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "lint": "next lint"
  },
  "dependencies": {
    "@cold-start/core": "file:../../packages/core",
    "@cold-start/db": "file:../../packages/db",
    "@cold-start/llm": "file:../../packages/llm",
    "@cold-start/pipeline": "file:../../packages/pipeline",
    "@cold-start/providers": "file:../../packages/providers",
    "@cold-start/ui": "file:../../packages/ui",
    "@tailwindcss/postcss": "^4.1.0",
    "inngest": "^3.40.0",
    "next": "^15.4.0",
    "postcss": "^8.5.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "tailwindcss": "^4.1.0",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "@types/react": "^19.1.0",
    "@types/react-dom": "^19.1.0",
    "typescript": "^5.9.0"
  }
}
```

Create `apps/web/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "preserve",
    "noEmit": true,
    "incremental": true,
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "src", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

Create `apps/extension/package.json`:

```json
{
  "name": "@cold-start/extension",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "build": "vite build",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@crxjs/vite-plugin": "^2.0.0-beta.32",
    "@cold-start/core": "file:../../packages/core",
    "@cold-start/ui": "file:../../packages/ui",
    "@vitejs/plugin-react": "^5.0.0",
    "vite": "^7.0.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0"
  },
  "devDependencies": {
    "@types/chrome": "^0.0.330",
    "@types/react": "^19.1.0",
    "@types/react-dom": "^19.1.0",
    "jsdom": "^26.1.0",
    "typescript": "^5.9.0",
    "vitest": "^3.2.0"
  }
}
```

Create `apps/extension/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "types": ["chrome"]
  },
  "include": ["src", "tests", "manifest.config.ts", "vite.config.ts"]
}
```

- [ ] **Step 5: Install dependencies**

Run: `npm install`

Expected: PASS and creates `package-lock.json`.

- [ ] **Step 6: Run smoke test**

Run: `npm test --workspaces --if-present`

Expected: PASS for `packages/core/tests/slug.test.ts`.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.base.json vitest.workspace.ts .gitignore .env.example packages apps docs/superpowers/plans/2026-05-06-cold-start-implementation.md
git commit -m "chore: scaffold cold start workspace"
```

---

### Task 2: Core Card Contract And Trust Rules

**Files:**
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/src/card.ts`
- Create: `packages/core/src/trust.ts`
- Create: `packages/core/src/slug.ts`
- Modify: `packages/core/tests/slug.test.ts`
- Create: `packages/core/tests/trust.test.ts`

- [ ] **Step 1: Write failing trust tests**

Create `packages/core/tests/trust.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  type ColdStartCard,
  publicCard,
  sanitizeCardTrust,
  stripUnsupportedSynthesis
} from "../src/index";

const baseCard: ColdStartCard = {
  slug: "cartesia",
  domain: "cartesia.ai",
  generatedAt: "2026-05-06T12:00:00.000Z",
  generationCostUsd: 0.12,
  cacheStatus: "miss",
  identity: {
    name: { value: "Cartesia", status: "verified", confidence: "high", citationIds: ["c1"] },
    logoUrl: null,
    oneLiner: { value: "Real-time voice AI platform", status: "verified", confidence: "high", citationIds: ["c1"] },
    hq: { value: { city: "San Francisco", country: "US" }, status: "verified", confidence: "high", citationIds: ["c1"] },
    foundedYear: { value: 2023, status: "verified", confidence: "high", citationIds: ["c1"] },
    status: "private"
  },
  funding: {
    totalRaisedUsd: { value: 91000000, status: "verified", confidence: "high", citationIds: ["c2"] },
    lastRound: {
      value: { name: "Series B", amountUsd: 64000000, announcedAt: "2025-03-01", leadInvestors: ["Kleiner Perkins"] },
      status: "verified",
      confidence: "high",
      citationIds: ["c2"]
    },
    investors: { value: [{ name: "Kleiner Perkins", domain: "kleinerperkins.com" }], status: "verified", confidence: "high", citationIds: ["c2"] }
  },
  team: {
    founders: { value: [{ name: "Karan Goel", role: "Co-founder", sourceUrl: "https://cartesia.ai" }], status: "verified", confidence: "high", citationIds: ["c1"] },
    keyExecs: { value: [], status: "verified", confidence: "high", citationIds: ["c1"] },
    headcount: { value: { value: 42, asOf: "2026-05-06" }, status: "inferred", confidence: "low", citationIds: ["c3"] }
  },
  signals: [],
  comparables: [],
  citations: [
    { id: "c1", url: "https://cartesia.ai", title: "Cartesia", fetchedAt: "2026-05-06T12:00:00.000Z", sourceType: "company_site" },
    { id: "c2", url: "https://example.com/cartesia-funding", title: "Funding", fetchedAt: "2026-05-06T12:00:00.000Z", sourceType: "news" },
    { id: "c3", url: "https://example.com/cartesia-headcount", title: "Headcount", fetchedAt: "2026-05-06T12:00:00.000Z", sourceType: "enrichment" }
  ],
  synthesis: {
    whyItMatters: { text: "Cartesia is relevant because real-time voice is a live infra wedge [c1].", citationIds: ["c1"] },
    bullCase: [{ text: "The company has a credible infra wedge [c1].", citationIds: ["c1"] }],
    bearCase: [{ text: "Competition is intense [needs_verification].", citationIds: [] }],
    openQuestions: ["Which buyer owns the budget?"]
  }
};

describe("publicCard", () => {
  it("omits synthesis from the public tier", () => {
    expect(publicCard(baseCard)).not.toHaveProperty("synthesis");
  });
});

describe("sanitizeCardTrust", () => {
  it("nulls facts with no citations instead of showing uncited values", () => {
    const dirty: ColdStartCard = {
      ...baseCard,
      identity: {
        ...baseCard.identity,
        foundedYear: { value: 2023, status: "verified", confidence: "high", citationIds: [] }
      }
    };

    const clean = sanitizeCardTrust(dirty);

    expect(clean.identity.foundedYear).toEqual({
      value: null,
      status: "unknown",
      confidence: "low",
      citationIds: []
    });
  });
});

describe("stripUnsupportedSynthesis", () => {
  it("drops synthesis lines that contain verification sentinels", () => {
    const clean = stripUnsupportedSynthesis(baseCard);

    expect(clean.synthesis?.bearCase).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @cold-start/core`

Expected: FAIL with missing exports for `ColdStartCard`, `publicCard`, `sanitizeCardTrust`, and `stripUnsupportedSynthesis`.

- [ ] **Step 3: Implement schema and trust rules**

Create `packages/core/src/card.ts`:

```typescript
import { z } from "zod";

export const citationSchema = z.object({
  id: z.string().min(1),
  url: z.string().url(),
  title: z.string().min(1),
  fetchedAt: z.string().datetime(),
  sourceType: z.enum(["company_site", "news", "filing", "enrichment", "github", "rdap", "other"]),
  snippet: z.string().optional()
});

export const confidenceSchema = z.enum(["high", "medium", "low"]);
export const factStatusSchema = z.enum(["verified", "mixed", "inferred", "unknown"]);

export const resolvedFactSchema = <T extends z.ZodTypeAny>(valueSchema: T) =>
  z.object({
    value: valueSchema.nullable(),
    status: factStatusSchema,
    confidence: confidenceSchema,
    citationIds: z.array(z.string().min(1))
  });

export const roundSchema = z.object({
  name: z.string().min(1),
  amountUsd: z.number().int().positive().nullable(),
  announcedAt: z.string().min(1).nullable(),
  leadInvestors: z.array(z.string().min(1))
});

export const investorSchema = z.object({
  name: z.string().min(1),
  domain: z.string().min(1).nullable()
});

export const personSchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1).nullable(),
  sourceUrl: z.string().url().nullable()
});

export const signalSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
  date: z.string().min(1),
  source: z.string().min(1),
  category: z.enum(["news", "hiring", "launch", "funding", "filing", "github", "other"]),
  citationIds: z.array(z.string().min(1))
});

export const comparableSchema = z.object({
  name: z.string().min(1),
  domain: z.string().min(1),
  oneLiner: z.string().min(1)
});

export const sourcedTextSchema = z.object({
  text: z.string().min(1),
  citationIds: z.array(z.string().min(1))
});

export const synthesisSchema = z.object({
  whyItMatters: sourcedTextSchema,
  bullCase: z.array(sourcedTextSchema),
  bearCase: z.array(sourcedTextSchema),
  openQuestions: z.array(z.string().min(1))
});

export const coldStartCardSchema = z.object({
  slug: z.string().min(1),
  domain: z.string().min(1),
  generatedAt: z.string().datetime(),
  generationCostUsd: z.number().nonnegative(),
  cacheStatus: z.enum(["hit", "partial", "miss"]),
  identity: z.object({
    name: resolvedFactSchema(z.string().min(1)),
    logoUrl: z.string().url().nullable(),
    oneLiner: resolvedFactSchema(z.string().max(120)),
    hq: resolvedFactSchema(z.object({ city: z.string().min(1), country: z.string().min(1) })),
    foundedYear: resolvedFactSchema(z.number().int().min(1800).max(2100)),
    status: z.enum(["private", "public", "acquired", "shutdown"])
  }),
  funding: z.object({
    totalRaisedUsd: resolvedFactSchema(z.number().int().nonnegative()),
    lastRound: resolvedFactSchema(roundSchema),
    investors: resolvedFactSchema(z.array(investorSchema))
  }),
  team: z.object({
    founders: resolvedFactSchema(z.array(personSchema)),
    keyExecs: resolvedFactSchema(z.array(personSchema)),
    headcount: resolvedFactSchema(z.object({ value: z.number().int().nonnegative(), asOf: z.string().min(1) }))
  }),
  signals: z.array(signalSchema),
  comparables: z.array(comparableSchema),
  citations: z.array(citationSchema),
  synthesis: synthesisSchema.optional()
});

export type Citation = z.infer<typeof citationSchema>;
export type ColdStartCard = z.infer<typeof coldStartCardSchema>;
export type ResolvedFact<T> = {
  value: T | null;
  status: z.infer<typeof factStatusSchema>;
  confidence: z.infer<typeof confidenceSchema>;
  citationIds: string[];
};
export type SourcedText = z.infer<typeof sourcedTextSchema>;
```

Create `packages/core/src/trust.ts`:

```typescript
import type { ColdStartCard, ResolvedFact, SourcedText } from "./card";

const verificationSentinel = /\[needs_verification\]/i;
const forbiddenSynthesisPhrases = /\b(reportedly|industry sources suggest|rumored to|appears to be|is said to)\b/i;

function sanitizeFact<T>(fact: ResolvedFact<T>): ResolvedFact<T> {
  if (fact.citationIds.length > 0) {
    return fact;
  }

  return {
    value: null,
    status: "unknown",
    confidence: "low",
    citationIds: []
  };
}

function keepSupportedText(item: SourcedText): boolean {
  if (item.citationIds.length === 0) {
    return false;
  }

  if (verificationSentinel.test(item.text)) {
    return false;
  }

  return !forbiddenSynthesisPhrases.test(item.text);
}

export function sanitizeCardTrust(card: ColdStartCard): ColdStartCard {
  return {
    ...card,
    identity: {
      ...card.identity,
      name: sanitizeFact(card.identity.name),
      oneLiner: sanitizeFact(card.identity.oneLiner),
      hq: sanitizeFact(card.identity.hq),
      foundedYear: sanitizeFact(card.identity.foundedYear)
    },
    funding: {
      totalRaisedUsd: sanitizeFact(card.funding.totalRaisedUsd),
      lastRound: sanitizeFact(card.funding.lastRound),
      investors: sanitizeFact(card.funding.investors)
    },
    team: {
      founders: sanitizeFact(card.team.founders),
      keyExecs: sanitizeFact(card.team.keyExecs),
      headcount: sanitizeFact(card.team.headcount)
    }
  };
}

export function stripUnsupportedSynthesis(card: ColdStartCard): ColdStartCard {
  if (!card.synthesis) {
    return card;
  }

  const whyItMatters = keepSupportedText(card.synthesis.whyItMatters)
    ? card.synthesis.whyItMatters
    : { text: "", citationIds: [] };

  const synthesis = {
    whyItMatters,
    bullCase: card.synthesis.bullCase.filter(keepSupportedText).slice(0, 3),
    bearCase: card.synthesis.bearCase.filter(keepSupportedText).slice(0, 3),
    openQuestions: card.synthesis.openQuestions.filter((question) => question.trim().length > 0).slice(0, 3)
  };

  return { ...card, synthesis };
}

export function publicCard(card: ColdStartCard): Omit<ColdStartCard, "synthesis"> {
  const { synthesis: _synthesis, ...publicOnly } = stripUnsupportedSynthesis(sanitizeCardTrust(card));
  return publicOnly;
}
```

Create `packages/core/src/slug.ts`:

```typescript
export function companySlugFromDomain(input: string): string {
  const value = input.trim();
  const url = value.startsWith("http") ? new URL(value) : new URL(`https://${value}`);
  const host = url.hostname.replace(/^www\./, "");
  const firstLabel = host.split(".")[0] ?? "unknown";
  const slug = firstLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug.length > 0 ? slug : "unknown";
}

export function canonicalDomain(input: string): string {
  const value = input.trim();
  const url = value.startsWith("http") ? new URL(value) : new URL(`https://${value}`);
  return url.hostname.replace(/^www\./, "").toLowerCase();
}
```

Modify `packages/core/src/index.ts`:

```typescript
export * from "./card";
export * from "./slug";
export * from "./trust";
```

Modify `packages/core/tests/slug.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { canonicalDomain, companySlugFromDomain } from "../src/index";

describe("companySlugFromDomain", () => {
  it("normalizes a company domain into a stable slug", () => {
    expect(companySlugFromDomain("https://www.Cartesia.ai/about")).toBe("cartesia");
  });
});

describe("canonicalDomain", () => {
  it("normalizes a URL into a bare lowercase domain", () => {
    expect(canonicalDomain("https://www.Cartesia.ai/about")).toBe("cartesia.ai");
  });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w @cold-start/core`

Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck -w @cold-start/core`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core
git commit -m "feat: define card contract and trust rules"
```

---

### Task 3: Database Schema And Repository

**Files:**
- Create: `packages/db/drizzle.config.ts`
- Create: `packages/db/src/schema.ts`
- Create: `packages/db/src/client.ts`
- Create: `packages/db/src/repository.ts`
- Modify: `packages/db/src/index.ts`
- Create: `packages/db/tests/schema.test.ts`

- [ ] **Step 1: Write failing schema tests**

Create `packages/db/tests/schema.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { cards, citations, claims, generationRuns, sources } from "../src/schema";

describe("database schema", () => {
  it("exports every table required by the card pipeline", () => {
    expect(cards).toBeDefined();
    expect(claims).toBeDefined();
    expect(citations).toBeDefined();
    expect(sources).toBeDefined();
    expect(generationRuns).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @cold-start/db`

Expected: FAIL with missing `../src/schema` module.

- [ ] **Step 3: Implement Drizzle schema**

Create `packages/db/drizzle.config.ts`:

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? ""
  }
});
```

Create `packages/db/src/schema.ts`:

```typescript
import { index, jsonb, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const cacheStatusEnum = pgEnum("cache_status", ["hit", "partial", "miss"]);
export const claimVisibilityEnum = pgEnum("claim_visibility", ["public", "gated"]);
export const claimStatusEnum = pgEnum("claim_status", ["verified", "mixed", "inferred", "unknown"]);
export const sourceTypeEnum = pgEnum("source_type", ["company_site", "news", "filing", "enrichment", "github", "rdap", "other"]);
export const generationStatusEnum = pgEnum("generation_status", ["queued", "running", "complete", "failed"]);

export const cards = pgTable(
  "cards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    domain: text("domain").notNull(),
    cardJson: jsonb("card_json").notNull(),
    publicCardJson: jsonb("public_card_json").notNull(),
    cacheStatus: cacheStatusEnum("cache_status").notNull(),
    generationCostUsd: numeric("generation_cost_usd", { precision: 10, scale: 4 }).notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull(),
    identityExpiresAt: timestamp("identity_expires_at", { withTimezone: true }).notNull(),
    signalsExpiresAt: timestamp("signals_expires_at", { withTimezone: true }).notNull(),
    synthesisExpiresAt: timestamp("synthesis_expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    slugIdx: uniqueIndex("cards_slug_idx").on(table.slug),
    domainIdx: uniqueIndex("cards_domain_idx").on(table.domain)
  })
);

export const sources = pgTable(
  "sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cardId: uuid("card_id").references(() => cards.id, { onDelete: "cascade" }).notNull(),
    url: text("url").notNull(),
    title: text("title").notNull(),
    sourceType: sourceTypeEnum("source_type").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
    rawText: text("raw_text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    cardUrlIdx: uniqueIndex("sources_card_url_idx").on(table.cardId, table.url)
  })
);

export const citations = pgTable(
  "citations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cardId: uuid("card_id").references(() => cards.id, { onDelete: "cascade" }).notNull(),
    citationKey: text("citation_key").notNull(),
    url: text("url").notNull(),
    title: text("title").notNull(),
    sourceType: sourceTypeEnum("source_type").notNull(),
    snippet: text("snippet"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull()
  },
  (table) => ({
    citationKeyIdx: uniqueIndex("citations_card_key_idx").on(table.cardId, table.citationKey)
  })
);

export const claims = pgTable(
  "claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cardId: uuid("card_id").references(() => cards.id, { onDelete: "cascade" }).notNull(),
    path: text("path").notNull(),
    visibility: claimVisibilityEnum("visibility").notNull(),
    status: claimStatusEnum("status").notNull(),
    confidence: text("confidence").notNull(),
    valueJson: jsonb("value_json"),
    citationKeys: jsonb("citation_keys").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    pathIdx: index("claims_card_path_idx").on(table.cardId, table.path)
  })
);

export const generationRuns = pgTable(
  "generation_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    domain: text("domain").notNull(),
    status: generationStatusEnum("status").notNull(),
    error: text("error"),
    costUsd: numeric("cost_usd", { precision: 10, scale: 4 }),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true })
  },
  (table) => ({
    slugStartedIdx: index("generation_runs_slug_started_idx").on(table.slug, table.startedAt)
  })
);
```

Create `packages/db/src/client.ts`:

```typescript
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export function createDb(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const sql = neon(databaseUrl);
  return drizzle(sql, { schema });
}

export type ColdStartDb = ReturnType<typeof createDb>;
```

Create `packages/db/src/repository.ts`:

```typescript
import { eq } from "drizzle-orm";
import { type ColdStartCard, coldStartCardSchema, publicCard } from "@cold-start/core";
import type { ColdStartDb } from "./client";
import { cards, citations, claims, generationRuns, sources } from "./schema";

export async function findCardBySlug(db: ColdStartDb, slug: string): Promise<ColdStartCard | null> {
  const rows = await db.select().from(cards).where(eq(cards.slug, slug)).limit(1);
  const row = rows[0];

  if (!row) {
    return null;
  }

  return coldStartCardSchema.parse(row.cardJson);
}

export async function upsertCard(db: ColdStartDb, card: ColdStartCard) {
  const publicOnly = publicCard(card);
  const [row] = await db
    .insert(cards)
    .values({
      slug: card.slug,
      domain: card.domain,
      cardJson: card,
      publicCardJson: publicOnly,
      cacheStatus: card.cacheStatus,
      generationCostUsd: String(card.generationCostUsd),
      generatedAt: new Date(card.generatedAt),
      identityExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      signalsExpiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
      synthesisExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    })
    .onConflictDoUpdate({
      target: cards.slug,
      set: {
        cardJson: card,
        publicCardJson: publicOnly,
        cacheStatus: card.cacheStatus,
        generationCostUsd: String(card.generationCostUsd),
        generatedAt: new Date(card.generatedAt),
        updatedAt: new Date()
      }
    })
    .returning();

  if (!row) {
    throw new Error(`Failed to upsert card for ${card.slug}`);
  }

  return row;
}

export async function recordCardEvidence(db: ColdStartDb, cardId: string, card: ColdStartCard) {
  await db.delete(citations).where(eq(citations.cardId, cardId));
  await db.delete(claims).where(eq(claims.cardId, cardId));

  if (card.citations.length > 0) {
    await db.insert(citations).values(
      card.citations.map((citation) => ({
        cardId,
        citationKey: citation.id,
        url: citation.url,
        title: citation.title,
        sourceType: citation.sourceType,
        ...(citation.snippet ? { snippet: citation.snippet } : {}),
        fetchedAt: new Date(citation.fetchedAt)
      }))
    );
  }

  const publicClaims = [
    ["identity.name", card.identity.name],
    ["identity.oneLiner", card.identity.oneLiner],
    ["identity.hq", card.identity.hq],
    ["identity.foundedYear", card.identity.foundedYear],
    ["funding.totalRaisedUsd", card.funding.totalRaisedUsd],
    ["funding.lastRound", card.funding.lastRound],
    ["funding.investors", card.funding.investors],
    ["team.founders", card.team.founders],
    ["team.keyExecs", card.team.keyExecs],
    ["team.headcount", card.team.headcount]
  ] as const;

  await db.insert(claims).values(
    publicClaims.map(([path, fact]) => ({
      cardId,
      path,
      visibility: "public",
      status: fact.status,
      confidence: fact.confidence,
      valueJson: fact.value,
      citationKeys: fact.citationIds
    }))
  );
}

export async function recordSource(db: ColdStartDb, input: {
  cardId: string;
  url: string;
  title: string;
  sourceType: "company_site" | "news" | "filing" | "enrichment" | "github" | "rdap" | "other";
  fetchedAt: string;
  rawText: string;
}) {
  await db.insert(sources).values({
    cardId: input.cardId,
    url: input.url,
    title: input.title,
    sourceType: input.sourceType,
    fetchedAt: new Date(input.fetchedAt),
    rawText: input.rawText
  }).onConflictDoNothing();
}

export async function markGenerationRun(db: ColdStartDb, input: {
  slug: string;
  domain: string;
  status: "queued" | "running" | "complete" | "failed";
  error?: string;
  costUsd?: number;
}) {
  const [row] = await db.insert(generationRuns).values({
    slug: input.slug,
    domain: input.domain,
    status: input.status,
    error: input.error,
    costUsd: input.costUsd === undefined ? undefined : String(input.costUsd),
    completedAt: input.status === "complete" || input.status === "failed" ? new Date() : undefined
  }).returning();

  return row;
}
```

Modify `packages/db/src/index.ts`:

```typescript
export * from "./client";
export * from "./repository";
export * from "./schema";
```

- [ ] **Step 4: Run unit test**

Run: `npm test -w @cold-start/db`

Expected: PASS.

- [ ] **Step 5: Generate migration**

Run: `npm run db:generate -w @cold-start/db`

Expected: PASS and creates a migration under `packages/db/drizzle/`.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck -w @cold-start/db`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/db
git commit -m "feat: add card storage schema"
```

---

### Task 4: AgentCash Stableenrich Spike Harness

**Files:**
- Create: `packages/providers/src/types.ts`
- Create: `packages/providers/src/agentcash.ts`
- Create: `packages/providers/src/stableenrich.ts`
- Create: `packages/providers/src/direct-fallback.ts`
- Modify: `packages/providers/src/index.ts`
- Create: `packages/providers/scripts/spike-stableenrich.ts`
- Create: `packages/providers/tests/stableenrich.test.ts`

- [ ] **Step 1: Write failing provider tests**

Create `packages/providers/tests/stableenrich.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { buildStableenrichRequests, missingStableenrichConfig } from "../src/index";

describe("missingStableenrichConfig", () => {
  it("reports every missing endpoint needed by the day one spike", () => {
    expect(missingStableenrichConfig({})).toEqual([
      "AGENTCASH_API_KEY",
      "STABLEENRICH_EXA_SEARCH_URL",
      "STABLEENRICH_EXA_SIMILAR_URL",
      "STABLEENRICH_FIRECRAWL_URL",
      "STABLEENRICH_ORG_ENRICH_URL",
      "STABLEENRICH_LINKEDIN_URL"
    ]);
  });
});

describe("buildStableenrichRequests", () => {
  it("builds the five endpoint probes required by SPEC.md", () => {
    const requests = buildStableenrichRequests({
      AGENTCASH_API_KEY: "key",
      STABLEENRICH_EXA_SEARCH_URL: "https://stable.example/exa/search",
      STABLEENRICH_EXA_SIMILAR_URL: "https://stable.example/exa/similar",
      STABLEENRICH_FIRECRAWL_URL: "https://stable.example/firecrawl",
      STABLEENRICH_ORG_ENRICH_URL: "https://stable.example/org",
      STABLEENRICH_LINKEDIN_URL: "https://stable.example/linkedin"
    }, "cartesia.ai");

    expect(requests.map((request) => request.name)).toEqual([
      "exa_search_news",
      "exa_find_similar",
      "firecrawl_homepage",
      "org_enrichment",
      "linkedin_company"
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @cold-start/providers`

Expected: FAIL with missing exports.

- [ ] **Step 3: Implement provider wrapper**

Create `packages/providers/src/types.ts`:

```typescript
export type StableenrichEnv = Partial<Record<
  | "AGENTCASH_API_KEY"
  | "STABLEENRICH_EXA_SEARCH_URL"
  | "STABLEENRICH_EXA_SIMILAR_URL"
  | "STABLEENRICH_FIRECRAWL_URL"
  | "STABLEENRICH_ORG_ENRICH_URL"
  | "STABLEENRICH_LINKEDIN_URL",
  string
>>;

export type StableenrichProbeName =
  | "exa_search_news"
  | "exa_find_similar"
  | "firecrawl_homepage"
  | "org_enrichment"
  | "linkedin_company";

export type StableenrichProbe = {
  name: StableenrichProbeName;
  url: string;
  body: Record<string, unknown>;
};

export type ProviderSource = {
  url: string;
  title: string;
  sourceType: "company_site" | "news" | "filing" | "enrichment" | "github" | "rdap" | "other";
  fetchedAt: string;
  rawText: string;
};
```

Create `packages/providers/src/agentcash.ts`:

```typescript
export async function agentcashJson<T>(input: {
  url: string;
  apiKey: string;
  body: Record<string, unknown>;
  fetchImpl?: typeof fetch;
}): Promise<T> {
  const fetcher = input.fetchImpl ?? fetch;
  const response = await fetcher(input.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${input.apiKey}`
    },
    body: JSON.stringify(input.body)
  });

  if (!response.ok) {
    throw new Error(`AgentCash call failed: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}
```

Create `packages/providers/src/stableenrich.ts`:

```typescript
import { agentcashJson } from "./agentcash";
import type { ProviderSource, StableenrichEnv, StableenrichProbe } from "./types";

const requiredKeys = [
  "AGENTCASH_API_KEY",
  "STABLEENRICH_EXA_SEARCH_URL",
  "STABLEENRICH_EXA_SIMILAR_URL",
  "STABLEENRICH_FIRECRAWL_URL",
  "STABLEENRICH_ORG_ENRICH_URL",
  "STABLEENRICH_LINKEDIN_URL"
] as const;

export function missingStableenrichConfig(env: StableenrichEnv): string[] {
  return requiredKeys.filter((key) => !env[key]);
}

export function buildStableenrichRequests(env: StableenrichEnv, domain: string): StableenrichProbe[] {
  const missing = missingStableenrichConfig(env);
  if (missing.length > 0) {
    throw new Error(`Missing stableenrich config: ${missing.join(", ")}`);
  }

  return [
    {
      name: "exa_search_news",
      url: env.STABLEENRICH_EXA_SEARCH_URL!,
      body: { query: `${domain} funding founders product launch`, numResults: 8 }
    },
    {
      name: "exa_find_similar",
      url: env.STABLEENRICH_EXA_SIMILAR_URL!,
      body: { url: `https://${domain}`, numResults: 8 }
    },
    {
      name: "firecrawl_homepage",
      url: env.STABLEENRICH_FIRECRAWL_URL!,
      body: { url: `https://${domain}`, paths: ["/", "/about", "/team", "/pricing"] }
    },
    {
      name: "org_enrichment",
      url: env.STABLEENRICH_ORG_ENRICH_URL!,
      body: { domain }
    },
    {
      name: "linkedin_company",
      url: env.STABLEENRICH_LINKEDIN_URL!,
      body: { domain }
    }
  ];
}

export async function runStableenrichProbe(input: {
  env: StableenrichEnv;
  domain: string;
  fetchImpl?: typeof fetch;
}) {
  const apiKey = input.env.AGENTCASH_API_KEY;
  if (!apiKey) {
    throw new Error("AGENTCASH_API_KEY is required");
  }

  const requests = buildStableenrichRequests(input.env, input.domain);
  return Promise.allSettled(
    requests.map(async (request) => ({
      name: request.name,
      endpointUrl: request.url,
      result: await agentcashJson<unknown>({
        url: request.url,
        apiKey,
        body: request.body,
        fetchImpl: input.fetchImpl
      })
    }))
  );
}

export async function fetchStableenrichSources(input: {
  env: StableenrichEnv;
  domain: string;
  fetchImpl?: typeof fetch;
}): Promise<ProviderSource[]> {
  const results = await runStableenrichProbe(input);

  return results.flatMap((result) => {
    if (result.status !== "fulfilled") {
      return [];
    }

    const sourceType: ProviderSource["sourceType"] =
      result.value.name === "firecrawl_homepage"
        ? "company_site"
        : result.value.name === "exa_search_news"
          ? "news"
          : "enrichment";

    return [
      providerSourceFromText({
        url: `agentcash:${result.value.name}`,
        title: result.value.name,
        sourceType,
        rawText: JSON.stringify(result.value.result)
      })
    ];
  });
}

export function providerSourceFromText(input: {
  url: string;
  title: string;
  sourceType: ProviderSource["sourceType"];
  rawText: string;
}): ProviderSource {
  return {
    ...input,
    fetchedAt: new Date().toISOString()
  };
}
```

Create `packages/providers/src/direct-fallback.ts`:

```typescript
export type DirectFallbackConfig = {
  exaApiKey?: string;
  firecrawlApiKey?: string;
  pdlApiKey?: string;
};

export function directFallbackGaps(config: DirectFallbackConfig) {
  return {
    exa: !config.exaApiKey,
    firecrawl: !config.firecrawlApiKey,
    pdl: !config.pdlApiKey
  };
}
```

Modify `packages/providers/src/index.ts`:

```typescript
export * from "./agentcash";
export * from "./direct-fallback";
export * from "./stableenrich";
export * from "./types";
```

Create `packages/providers/scripts/spike-stableenrich.ts`:

```typescript
import { runStableenrichProbe, type StableenrichEnv } from "../src/index";

const domain = process.argv[2] ?? "cartesia.ai";

const env: StableenrichEnv = {
  AGENTCASH_API_KEY: process.env.AGENTCASH_API_KEY,
  STABLEENRICH_EXA_SEARCH_URL: process.env.STABLEENRICH_EXA_SEARCH_URL,
  STABLEENRICH_EXA_SIMILAR_URL: process.env.STABLEENRICH_EXA_SIMILAR_URL,
  STABLEENRICH_FIRECRAWL_URL: process.env.STABLEENRICH_FIRECRAWL_URL,
  STABLEENRICH_ORG_ENRICH_URL: process.env.STABLEENRICH_ORG_ENRICH_URL,
  STABLEENRICH_LINKEDIN_URL: process.env.STABLEENRICH_LINKEDIN_URL
};

const results = await runStableenrichProbe({ env, domain });

for (const result of results) {
  if (result.status === "fulfilled") {
    console.log(JSON.stringify({ endpoint: result.value.name, status: "ok" }));
  } else {
    console.log(JSON.stringify({ status: "failed", error: result.reason instanceof Error ? result.reason.message : String(result.reason) }));
  }
}
```

- [ ] **Step 4: Run unit test**

Run: `npm test -w @cold-start/providers`

Expected: PASS.

- [ ] **Step 5: Run stableenrich spike**

Run after real AgentCash endpoint URLs are discovered and `.env` is populated:

```bash
npm run spike:stableenrich -w @cold-start/providers -- cartesia.ai
```

Expected: five JSON lines, each with `status: "ok"`, or specific failed endpoint names. Any failed endpoint becomes a direct-vendor fallback decision before Task 7.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck -w @cold-start/providers`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/providers .env.example
git commit -m "feat: add stableenrich spike harness"
```

---

### Task 5: LLM Extraction, Synthesis, And Verifier

**Files:**
- Create: `packages/llm/src/anthropic.ts`
- Create: `packages/llm/src/extraction.ts`
- Create: `packages/llm/src/synthesis.ts`
- Create: `packages/llm/src/verifier.ts`
- Modify: `packages/llm/src/index.ts`
- Create: `packages/llm/tests/extraction.test.ts`
- Create: `packages/llm/tests/verifier.test.ts`

- [ ] **Step 1: Write failing LLM parser tests**

Create `packages/llm/tests/extraction.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { parseExtractionToolUse } from "../src/index";

describe("parseExtractionToolUse", () => {
  it("extracts the forced tool payload", () => {
    const payload = parseExtractionToolUse({
      content: [
        { type: "text", text: "I will emit structured claims." },
        { type: "tool_use", name: "emit_company_claims", input: { identity: { name: "Cartesia" }, citations: [] } }
      ]
    });

    expect(payload).toEqual({ identity: { name: "Cartesia" }, citations: [] });
  });
});
```

Create `packages/llm/tests/verifier.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { applyVerifierResults } from "../src/index";

describe("applyVerifierResults", () => {
  it("keeps supported claims and drops unsupported claims", () => {
    const result = applyVerifierResults(
      [
        { text: "Bull claim [c1].", citationIds: ["c1"] },
        { text: "Unsupported claim [c2].", citationIds: ["c2"] }
      ],
      [
        { text: "Bull claim [c1].", status: "supported" },
        { text: "Unsupported claim [c2].", status: "unsupported" }
      ]
    );

    expect(result).toEqual([{ text: "Bull claim [c1].", citationIds: ["c1"] }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @cold-start/llm`

Expected: FAIL with missing exports.

- [ ] **Step 3: Implement Anthropic helper and parsers**

Create `packages/llm/src/anthropic.ts`:

```typescript
import Anthropic from "@anthropic-ai/sdk";

export function createAnthropicClient(apiKey = process.env.ANTHROPIC_API_KEY) {
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is required");
  }

  return new Anthropic({ apiKey });
}

export function anthropicModel(model = process.env.ANTHROPIC_MODEL) {
  if (!model) {
    throw new Error("ANTHROPIC_MODEL is required");
  }

  return model;
}
```

Create `packages/llm/src/extraction.ts`:

```typescript
import type Anthropic from "@anthropic-ai/sdk";

export type ExtractionEvidence = {
  domain: string;
  sources: Array<{ url: string; title: string; rawText: string; sourceType: string }>;
};

export const extractionTool = {
  name: "emit_company_claims",
  description: "Emit only company claims supported by the provided public sources.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      identity: { type: "object" },
      funding: { type: "object" },
      team: { type: "object" },
      signals: { type: "array", items: { type: "object" } },
      comparables: { type: "array", items: { type: "object" } },
      citations: { type: "array", items: { type: "object" } }
    },
    required: ["identity", "funding", "team", "signals", "comparables", "citations"]
  }
} as const;

export function parseExtractionToolUse(message: { content: Array<{ type: string; name?: string; input?: unknown }> }) {
  const toolUse = message.content.find((block) => block.type === "tool_use" && block.name === "emit_company_claims");
  if (!toolUse) {
    throw new Error("No emit_company_claims tool use returned");
  }

  return toolUse.input;
}

export async function extractCompanyClaims(input: {
  client: Anthropic;
  model: string;
  evidence: ExtractionEvidence;
}) {
  const response = await input.client.messages.create({
    model: input.model,
    max_tokens: 4000,
    system: [
      {
        type: "text",
        text: "You extract investor-grade public company facts. Drop unsupported claims. Every material fact must map to a citation ID. Use null for missing facts.",
        cache_control: { type: "ephemeral" }
      }
    ],
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: JSON.stringify(input.evidence)
          }
        ]
      }
    ],
    tools: [extractionTool],
    tool_choice: { type: "tool", name: "emit_company_claims" }
  });

  return parseExtractionToolUse(response);
}
```

Create `packages/llm/src/synthesis.ts`:

```typescript
import type Anthropic from "@anthropic-ai/sdk";
import type { ColdStartCard } from "@cold-start/core";

export const synthesisTool = {
  name: "emit_investor_synthesis",
  description: "Emit gated investor synthesis where every bull and bear line ends with citation markers already present on the card.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      whyItMatters: { type: "object" },
      bullCase: { type: "array", minItems: 3, maxItems: 3, items: { type: "object" } },
      bearCase: { type: "array", minItems: 3, maxItems: 3, items: { type: "object" } },
      openQuestions: { type: "array", minItems: 3, maxItems: 3, items: { type: "string" } }
    },
    required: ["whyItMatters", "bullCase", "bearCase", "openQuestions"]
  }
} as const;

export async function synthesizeCard(input: {
  client: Anthropic;
  model: string;
  card: ColdStartCard;
}) {
  const response = await input.client.messages.create({
    model: input.model,
    max_tokens: 2500,
    system: [
      {
        type: "text",
        text: "You write gated investor synthesis from validated claim-store input only. Every bull and bear bullet must end with citation markers. Do not use reportedly, rumored to, appears to be, is said to, or industry sources suggest.",
        cache_control: { type: "ephemeral" }
      }
    ],
    messages: [{ role: "user", content: JSON.stringify(input.card) }],
    tools: [synthesisTool],
    tool_choice: { type: "tool", name: "emit_investor_synthesis" }
  });

  const toolUse = response.content.find((block) => block.type === "tool_use" && block.name === "emit_investor_synthesis");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("No emit_investor_synthesis tool use returned");
  }

  return toolUse.input;
}
```

Create `packages/llm/src/verifier.ts`:

```typescript
import type Anthropic from "@anthropic-ai/sdk";
import type { SourcedText } from "@cold-start/core";

export type VerificationStatus = "supported" | "contradicted" | "unsupported";

export type VerificationResult = {
  text: string;
  status: VerificationStatus;
};

export function applyVerifierResults(items: SourcedText[], results: VerificationResult[]): SourcedText[] {
  const supported = new Set(results.filter((result) => result.status === "supported").map((result) => result.text));
  return items.filter((item) => supported.has(item.text));
}

export async function verifySynthesis(input: {
  client: Anthropic;
  model: string;
  claims: SourcedText[];
  sources: Array<{ id: string; url: string; title: string; snippet?: string }>;
}): Promise<VerificationResult[]> {
  const response = await input.client.messages.create({
    model: input.model,
    max_tokens: 2000,
    system: [
      {
        type: "text",
        text: "Verify whether each claim is supported by the cited source snippets. Return only JSON.",
        cache_control: { type: "ephemeral" }
      }
    ],
    messages: [
      {
        role: "user",
        content: JSON.stringify({ claims: input.claims, sources: input.sources })
      }
    ]
  });

  const text = response.content.find((block) => block.type === "text");
  if (!text || text.type !== "text") {
    throw new Error("Verifier returned no text block");
  }

  return JSON.parse(text.text) as VerificationResult[];
}
```

Modify `packages/llm/src/index.ts`:

```typescript
export * from "./anthropic";
export * from "./extraction";
export * from "./synthesis";
export * from "./verifier";
```

- [ ] **Step 4: Run tests**

Run: `npm test -w @cold-start/llm`

Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck -w @cold-start/llm`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/llm
git commit -m "feat: add cited extraction and verifier clients"
```

---

### Task 6: Pipeline Generation Orchestrator

**Files:**
- Create: `packages/pipeline/src/resolve-identity.ts`
- Create: `packages/pipeline/src/conflict-resolution.ts`
- Create: `packages/pipeline/src/cost.ts`
- Create: `packages/pipeline/src/generate-card.ts`
- Modify: `packages/pipeline/src/index.ts`
- Create: `packages/pipeline/tests/conflict-resolution.test.ts`
- Create: `packages/pipeline/tests/generate-card.test.ts`

- [ ] **Step 1: Write failing pipeline tests**

Create `packages/pipeline/tests/conflict-resolution.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { chooseMostAuthoritativeFact } from "../src/index";

describe("chooseMostAuthoritativeFact", () => {
  it("prefers recent primary source facts over older enrichment facts", () => {
    const result = chooseMostAuthoritativeFact([
      { value: 2021, sourceType: "enrichment", fetchedAt: "2026-05-06T12:00:00.000Z", citationId: "c2" },
      { value: 2020, sourceType: "company_site", fetchedAt: "2026-05-05T12:00:00.000Z", citationId: "c1" }
    ]);

    expect(result).toEqual({ value: 2020, sourceType: "company_site", fetchedAt: "2026-05-05T12:00:00.000Z", citationId: "c1" });
  });
});
```

Create `packages/pipeline/tests/generate-card.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { buildSkeletonCard } from "../src/index";

describe("buildSkeletonCard", () => {
  it("creates a public-safe unknown card before evidence arrives", () => {
    const card = buildSkeletonCard("cartesia.ai");

    expect(card.slug).toBe("cartesia");
    expect(card.identity.name.status).toBe("unknown");
    expect(card.identity.name.value).toBeNull();
    expect(card.synthesis).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @cold-start/pipeline`

Expected: FAIL with missing exports.

- [ ] **Step 3: Implement pipeline primitives**

Create `packages/pipeline/src/conflict-resolution.ts`:

```typescript
type CandidateFact<T> = {
  value: T;
  sourceType: string;
  fetchedAt: string;
  citationId: string;
};

const authorityRank: Record<string, number> = {
  filing: 5,
  company_site: 4,
  news: 3,
  enrichment: 2,
  github: 2,
  rdap: 2,
  other: 1
};

export function chooseMostAuthoritativeFact<T>(facts: CandidateFact<T>[]): CandidateFact<T> | null {
  if (facts.length === 0) {
    return null;
  }

  return [...facts].sort((left, right) => {
    const authorityDelta = (authorityRank[right.sourceType] ?? 0) - (authorityRank[left.sourceType] ?? 0);
    if (authorityDelta !== 0) {
      return authorityDelta;
    }

    return new Date(right.fetchedAt).getTime() - new Date(left.fetchedAt).getTime();
  })[0] ?? null;
}
```

Create `packages/pipeline/src/resolve-identity.ts`:

```typescript
import { canonicalDomain, companySlugFromDomain } from "@cold-start/core";

export function resolveIdentityFromInput(input: string) {
  const domain = canonicalDomain(input);
  return {
    slug: companySlugFromDomain(domain),
    domain
  };
}
```

Create `packages/pipeline/src/cost.ts`:

```typescript
export type CostLine = {
  label: string;
  usd: number;
};

export function totalGenerationCost(lines: CostLine[]) {
  return Number(lines.reduce((sum, line) => sum + line.usd, 0).toFixed(4));
}
```

Create `packages/pipeline/src/generate-card.ts`:

```typescript
import {
  type ColdStartCard,
  coldStartCardSchema,
  sanitizeCardTrust,
  type SourcedText,
  stripUnsupportedSynthesis
} from "@cold-start/core";
import { applyVerifierResults, type VerificationResult } from "@cold-start/llm";
import type { ProviderSource } from "@cold-start/providers";
import { resolveIdentityFromInput } from "./resolve-identity";
import { totalGenerationCost } from "./cost";

const unknown = {
  value: null,
  status: "unknown" as const,
  confidence: "low" as const,
  citationIds: []
};

export function buildSkeletonCard(input: string): ColdStartCard {
  const identity = resolveIdentityFromInput(input);
  return {
    ...identity,
    generatedAt: new Date().toISOString(),
    generationCostUsd: 0,
    cacheStatus: "miss",
    identity: {
      name: unknown,
      logoUrl: null,
      oneLiner: unknown,
      hq: unknown,
      foundedYear: unknown,
      status: "private"
    },
    funding: {
      totalRaisedUsd: unknown,
      lastRound: unknown,
      investors: unknown
    },
    team: {
      founders: unknown,
      keyExecs: unknown,
      headcount: unknown
    },
    signals: [],
    comparables: [],
    citations: []
  };
}

export function finalizeGeneratedCard(card: ColdStartCard): ColdStartCard {
  return stripUnsupportedSynthesis(sanitizeCardTrust(card));
}

export type ExtractedCardSections = Pick<ColdStartCard, "identity" | "funding" | "team" | "signals" | "comparables" | "citations">;

export type GenerateCardDeps = {
  fetchSources(domain: string): Promise<ProviderSource[]>;
  extractSections(input: { domain: string; sources: ProviderSource[] }): Promise<ExtractedCardSections>;
  synthesize?(card: ColdStartCard): Promise<ColdStartCard["synthesis"]>;
  verify?(claims: SourcedText[], sources: Array<{ id: string; url: string; title: string; snippet?: string }>): Promise<VerificationResult[]>;
};

function synthesisClaims(synthesis: NonNullable<ColdStartCard["synthesis"]>): SourcedText[] {
  return [
    synthesis.whyItMatters,
    ...synthesis.bullCase,
    ...synthesis.bearCase
  ];
}

export async function generateCardForDomain(domain: string, deps: GenerateCardDeps): Promise<ColdStartCard> {
  const skeleton = buildSkeletonCard(domain);
  const sources = await deps.fetchSources(skeleton.domain);
  const sections = await deps.extractSections({ domain: skeleton.domain, sources });

  let card: ColdStartCard = coldStartCardSchema.parse({
    ...skeleton,
    ...sections,
    generatedAt: new Date().toISOString(),
    generationCostUsd: totalGenerationCost([
      { label: "stableenrich", usd: 0.04 },
      { label: "extraction", usd: 0.03 }
    ]),
    cacheStatus: "miss"
  });

  const synthesis = deps.synthesize ? await deps.synthesize(card) : undefined;
  if (synthesis) {
    let verifiedSynthesis = synthesis;

    if (deps.verify) {
      const citationSources = card.citations.map((citation) => ({
        id: citation.id,
        url: citation.url,
        title: citation.title,
        ...(citation.snippet ? { snippet: citation.snippet } : {})
      }));
      const results = await deps.verify(synthesisClaims(synthesis), citationSources);
      verifiedSynthesis = {
        ...synthesis,
        bullCase: applyVerifierResults(synthesis.bullCase, results),
        bearCase: applyVerifierResults(synthesis.bearCase, results)
      };
    }

    card = { ...card, synthesis: verifiedSynthesis };
  }

  return finalizeGeneratedCard(coldStartCardSchema.parse(card));
}
```

Modify `packages/pipeline/src/index.ts`:

```typescript
export * from "./conflict-resolution";
export * from "./cost";
export * from "./generate-card";
export * from "./resolve-identity";
```

- [ ] **Step 4: Run tests**

Run: `npm test -w @cold-start/pipeline`

Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck -w @cold-start/pipeline`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/pipeline
git commit -m "feat: add card generation pipeline primitives"
```

---

### Task 7: Next.js Web App And Inngest Wiring

**Files:**
- Create: `apps/web/next.config.ts`
- Create: `apps/web/postcss.config.mjs`
- Create: `apps/web/src/app/globals.css`
- Create: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/page.tsx`
- Create: `apps/web/src/app/c/[slug]/loading.tsx`
- Create: `apps/web/src/app/c/[slug]/page.tsx`
- Create: `apps/web/src/app/api/cards/[slug]/route.ts`
- Create: `apps/web/src/app/api/generate/route.ts`
- Create: `apps/web/src/app/api/inngest/route.ts`
- Create: `apps/web/src/inngest/client.ts`
- Create: `apps/web/src/inngest/functions.ts`
- Create: `apps/web/src/lib/env.ts`

- [ ] **Step 1: Write failing route typecheck expectation**

Create `apps/web/src/lib/env.ts` first with a deliberately minimal export:

```typescript
export const envReady = false;
```

Run: `npm run typecheck -w @cold-start/web`

Expected: FAIL because Next.js app files do not exist yet and package imports are not wired.

- [ ] **Step 2: Implement Next config and app shell**

Create `apps/web/next.config.ts`:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    ppr: "incremental"
  },
  transpilePackages: [
    "@cold-start/core",
    "@cold-start/db",
    "@cold-start/llm",
    "@cold-start/pipeline",
    "@cold-start/providers",
    "@cold-start/ui"
  ]
};

export default nextConfig;
```

Create `apps/web/postcss.config.mjs`:

```javascript
const config = {
  plugins: {
    "@tailwindcss/postcss": {}
  }
};

export default config;
```

Create `apps/web/src/app/globals.css`:

```css
@import "@cold-start/ui/tokens.css";
@import "tailwindcss";

html,
body {
  margin: 0;
  min-height: 100%;
  background: var(--color-canvas-parchment);
  color: var(--color-ink);
  font-family: var(--font-plex-sans);
  font-feature-settings: "tnum" 1;
}

a {
  color: inherit;
}
```

Create `apps/web/src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cold Start",
  description: "Sourced company context cards."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

Create `apps/web/src/app/page.tsx`:

```tsx
export default function HomePage() {
  return (
    <main className="cs-home">
      <section>
        <p className="cs-kicker">coldstart.semitechie.vc</p>
        <h1>Cold Start</h1>
        <p>One click on a company website. A sourced context card in under thirty seconds.</p>
      </section>
    </main>
  );
}
```

Modify `apps/web/src/lib/env.ts`:

```typescript
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  NEXT_PUBLIC_WEB_ORIGIN: z.string().url(),
  INNGEST_EVENT_KEY: z.string().min(1).optional(),
  INNGEST_SIGNING_KEY: z.string().min(1).optional()
});

export function webEnv() {
  return envSchema.parse({
    DATABASE_URL: process.env.DATABASE_URL,
    NEXT_PUBLIC_WEB_ORIGIN: process.env.NEXT_PUBLIC_WEB_ORIGIN ?? "http://localhost:3000",
    INNGEST_EVENT_KEY: process.env.INNGEST_EVENT_KEY,
    INNGEST_SIGNING_KEY: process.env.INNGEST_SIGNING_KEY
  });
}
```

- [ ] **Step 3: Implement Inngest and routes**

Create `apps/web/src/inngest/client.ts`:

```typescript
import { Inngest } from "inngest";

export const inngest = new Inngest({ id: "cold-start" });
```

Create `apps/web/src/inngest/functions.ts`:

```typescript
import { createDb, findCardBySlug, recordCardEvidence, upsertCard } from "@cold-start/db";
import type { ColdStartCard } from "@cold-start/core";
import { anthropicModel, createAnthropicClient, extractCompanyClaims, synthesizeCard, verifySynthesis } from "@cold-start/llm";
import { generateCardForDomain, type ExtractedCardSections } from "@cold-start/pipeline";
import { fetchStableenrichSources, type StableenrichEnv } from "@cold-start/providers";
import { inngest } from "./client";

export const generateCardFunction = inngest.createFunction(
  { id: "generate-card" },
  { event: "card/generate.requested" },
  async ({ event, step }) => {
    const domain = String(event.data.domain);
    const anthropic = createAnthropicClient();
    const model = anthropicModel();
    const stableEnv: StableenrichEnv = {
      AGENTCASH_API_KEY: process.env.AGENTCASH_API_KEY,
      STABLEENRICH_EXA_SEARCH_URL: process.env.STABLEENRICH_EXA_SEARCH_URL,
      STABLEENRICH_EXA_SIMILAR_URL: process.env.STABLEENRICH_EXA_SIMILAR_URL,
      STABLEENRICH_FIRECRAWL_URL: process.env.STABLEENRICH_FIRECRAWL_URL,
      STABLEENRICH_ORG_ENRICH_URL: process.env.STABLEENRICH_ORG_ENRICH_URL,
      STABLEENRICH_LINKEDIN_URL: process.env.STABLEENRICH_LINKEDIN_URL
    };
    const clean = await step.run("generate-card", () =>
      generateCardForDomain(domain, {
        fetchSources: (candidateDomain) => fetchStableenrichSources({ env: stableEnv, domain: candidateDomain }),
        extractSections: async ({ domain: candidateDomain, sources }) =>
          extractCompanyClaims({
            client: anthropic,
            model,
            evidence: { domain: candidateDomain, sources }
          }) as Promise<ExtractedCardSections>,
        synthesize: async (card: ColdStartCard) =>
          synthesizeCard({ client: anthropic, model, card }) as Promise<ColdStartCard["synthesis"]>,
        verify: async (claims, sources) =>
          verifySynthesis({ client: anthropic, model, claims, sources })
      })
    );
    const db = createDb();
    const row = await step.run("upsert-card", () => upsertCard(db, clean));
    await step.run("record-card-evidence", () => recordCardEvidence(db, row.id, clean));
    return { slug: clean.slug };
  }
);

export async function getCachedCard(slug: string) {
  const db = createDb();
  return findCardBySlug(db, slug);
}
```

Create `apps/web/src/app/api/inngest/route.ts`:

```typescript
import { serve } from "inngest/next";
import { inngest } from "../../../inngest/client";
import { generateCardFunction } from "../../../inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [generateCardFunction]
});
```

Create `apps/web/src/app/api/generate/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { canonicalDomain, companySlugFromDomain } from "@cold-start/core";
import { inngest } from "../../../inngest/client";

export async function POST(request: Request) {
  const body = await request.json() as { domain?: string };

  if (!body.domain) {
    return NextResponse.json({ error: "domain is required" }, { status: 400 });
  }

  const domain = canonicalDomain(body.domain);
  const slug = companySlugFromDomain(domain);

  await inngest.send({
    name: "card/generate.requested",
    data: { domain, slug }
  });

  return NextResponse.json({ slug, status: "queued" }, { status: 202 });
}
```

Create `apps/web/src/app/api/cards/[slug]/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { publicCard } from "@cold-start/core";
import { getCachedCard } from "../../../../inngest/functions";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const card = await getCachedCard(slug);

  if (!card) {
    return NextResponse.json({ error: "card not found" }, { status: 404 });
  }

  return NextResponse.json(publicCard(card));
}
```

Create `apps/web/src/app/c/[slug]/loading.tsx`:

```tsx
export default function LoadingCard() {
  return <main className="cs-card-page">Loading sourced facts...</main>;
}
```

Create `apps/web/src/app/c/[slug]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { publicCard } from "@cold-start/core";
import { CardShell } from "@cold-start/ui";
import { getCachedCard } from "../../../inngest/functions";

export const experimental_ppr = true;

export default async function CompanyCardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const card = await getCachedCard(slug);

  if (!card) {
    notFound();
  }

  return (
    <main className="cs-card-page">
      <CardShell card={publicCard(card)} surface="web" />
    </main>
  );
}
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck -w @cold-start/web`

Expected: FAIL until Task 8 creates `CardShell` and UI exports.

- [ ] **Step 5: Commit partial route wiring**

Commit only after Task 8 passes typecheck, because this task intentionally depends on shared UI:

```bash
git add apps/web
git commit -m "feat: wire web app routes and inngest"
```

---

### Task 8: Shared Card UI And Design Tokens

**Files:**
- Create: `packages/ui/src/tokens.css`
- Create: `packages/ui/src/CitationMarker.tsx`
- Create: `packages/ui/src/FactRow.tsx`
- Create: `packages/ui/src/SourceDrawer.tsx`
- Create: `packages/ui/src/SynthesisSection.tsx`
- Create: `packages/ui/src/CardShell.tsx`
- Modify: `packages/ui/src/index.ts`
- Create: `packages/ui/tests/CardShell.test.tsx`

- [ ] **Step 1: Write failing UI test**

Create `packages/ui/tests/CardShell.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { type ColdStartCard } from "@cold-start/core";
import { CardShell } from "../src";

const card: ColdStartCard = {
  slug: "cartesia",
  domain: "cartesia.ai",
  generatedAt: "2026-05-06T12:00:00.000Z",
  generationCostUsd: 0.12,
  cacheStatus: "hit",
  identity: {
    name: { value: "Cartesia", status: "verified", confidence: "high", citationIds: ["c1"] },
    logoUrl: null,
    oneLiner: { value: "Real-time voice AI platform", status: "verified", confidence: "high", citationIds: ["c1"] },
    hq: { value: { city: "San Francisco", country: "US" }, status: "verified", confidence: "high", citationIds: ["c1"] },
    foundedYear: { value: 2023, status: "verified", confidence: "high", citationIds: ["c1"] },
    status: "private"
  },
  funding: {
    totalRaisedUsd: { value: 91000000, status: "verified", confidence: "high", citationIds: ["c2"] },
    lastRound: { value: null, status: "unknown", confidence: "low", citationIds: [] },
    investors: { value: [], status: "verified", confidence: "high", citationIds: ["c2"] }
  },
  team: {
    founders: { value: [], status: "unknown", confidence: "low", citationIds: [] },
    keyExecs: { value: [], status: "unknown", confidence: "low", citationIds: [] },
    headcount: { value: null, status: "unknown", confidence: "low", citationIds: [] }
  },
  signals: [],
  comparables: [],
  citations: [
    { id: "c1", url: "https://cartesia.ai", title: "Cartesia", fetchedAt: "2026-05-06T12:00:00.000Z", sourceType: "company_site" },
    { id: "c2", url: "https://example.com/funding", title: "Funding", fetchedAt: "2026-05-06T12:00:00.000Z", sourceType: "news" }
  ]
};

describe("CardShell", () => {
  it("renders public facts and citation markers", () => {
    render(<CardShell card={card} surface="web" />);
    expect(screen.getByText("Cartesia")).toBeTruthy();
    expect(screen.getAllByText("[c1]").length).toBeGreaterThan(0);
    expect(screen.queryByText("Bull case")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @cold-start/ui`

Expected: FAIL with missing `CardShell`.

- [ ] **Step 3: Implement tokens and components**

Create `packages/ui/src/tokens.css`:

```css
:root {
  --color-canvas-parchment: #FAFAF7;
  --color-card-cream: #FFFFFF;
  --color-ink: #0A0A0A;
  --color-mid-stone: #6E6E76;
  --color-soft-sand: #B7B6B0;
  --color-citation-ultramarine: #1A1F8C;
  --color-confidence-amber: #A8741F;
  --color-confidence-sky: #1A1F8C;
  --color-confidence-soft: #B7B6B0;
  --color-hover-pebble: #F0EFEA;
  --font-plex-sans: 'IBM Plex Sans', ui-sans-serif, system-ui, -apple-system, sans-serif;
  --font-plex-serif: 'IBM Plex Serif', ui-serif, Georgia, serif;
  --font-mona-sans: 'Mona Sans', 'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif;
  --font-berkeley-mono: 'Berkeley Mono', 'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace;
  --shadow-card: 0 1px 2px rgba(10, 10, 10, 0.04), 0 0 0 1px rgba(10, 10, 10, 0.06);
  --shadow-popover: 0 8px 24px rgba(10, 10, 10, 0.12), 0 0 0 1px rgba(10, 10, 10, 0.08);
}

.cs-card-page {
  max-width: 720px;
  margin: 0 auto;
  padding: 64px 20px;
}

.cs-card {
  background: var(--color-card-cream);
  box-shadow: var(--shadow-card);
  border-radius: 4px;
  padding: 32px;
}

.cs-card[data-surface="extension"] {
  width: 100%;
  min-height: 100vh;
  border-radius: 0;
  padding: 20px;
}

.cs-title {
  font-family: var(--font-mona-sans);
  font-size: clamp(36px, 8vw, 72px);
  line-height: 1;
  letter-spacing: 0;
  margin: 0 0 12px;
}

.cs-section {
  margin-top: 48px;
}

.cs-section h2 {
  font-family: var(--font-plex-sans);
  font-size: 20px;
  margin: 0 0 16px;
}

.cs-fact-row {
  display: grid;
  grid-template-columns: minmax(92px, 0.8fr) minmax(0, 1.2fr);
  gap: 12px;
  padding: 8px 0;
}

.cs-fact-label {
  color: var(--color-mid-stone);
  font-size: 14px;
  font-weight: 500;
}

.cs-fact-value {
  color: var(--color-ink);
  font-size: 14px;
  overflow-wrap: anywhere;
}

.cs-mono {
  font-family: var(--font-berkeley-mono);
  font-feature-settings: "tnum" 1;
}

.cs-citation {
  color: var(--color-citation-ultramarine);
  font-family: var(--font-berkeley-mono);
  font-size: 12px;
  margin-left: 4px;
}

.cs-source-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.cs-source-list li {
  padding: 10px 0;
}

@media (max-width: 520px) {
  .cs-card {
    padding: 20px;
  }

  .cs-fact-row {
    grid-template-columns: 1fr;
  }
}
```

Create `packages/ui/src/CitationMarker.tsx`:

```tsx
export function CitationMarker({ id }: { id: string }) {
  return <span className="cs-citation">[{id}]</span>;
}
```

Create `packages/ui/src/FactRow.tsx`:

```tsx
import type { ResolvedFact } from "@cold-start/core";
import { CitationMarker } from "./CitationMarker";

function valueToText(value: unknown): string {
  if (value === null || value === undefined) {
    return "not publicly disclosed";
  }

  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).filter(Boolean).join(", ");
  }

  if (typeof value === "number") {
    return new Intl.NumberFormat("en-US").format(value);
  }

  return String(value);
}

export function FactRow<T>({ label, fact, mono = false }: { label: string; fact: ResolvedFact<T>; mono?: boolean }) {
  return (
    <div className="cs-fact-row">
      <div className="cs-fact-label">{label}</div>
      <div className={mono ? "cs-fact-value cs-mono" : "cs-fact-value"}>
        {valueToText(fact.value)}
        {fact.citationIds.map((id) => <CitationMarker id={id} key={id} />)}
      </div>
    </div>
  );
}
```

Create `packages/ui/src/SourceDrawer.tsx`:

```tsx
import type { Citation } from "@cold-start/core";

export function SourceDrawer({ citations }: { citations: Citation[] }) {
  return (
    <section className="cs-section" aria-label="Sources">
      <h2>Sources</h2>
      <ol className="cs-source-list">
        {citations.map((citation) => (
          <li key={citation.id}>
            <span className="cs-citation">[{citation.id}]</span>{" "}
            <a href={citation.url} target="_blank" rel="noreferrer">{citation.title}</a>
            <div className="cs-mono">{citation.sourceType}</div>
          </li>
        ))}
      </ol>
    </section>
  );
}
```

Create `packages/ui/src/SynthesisSection.tsx`:

```tsx
import type { ColdStartCard } from "@cold-start/core";

export function SynthesisSection({ synthesis }: { synthesis: NonNullable<ColdStartCard["synthesis"]> }) {
  return (
    <section className="cs-section">
      <h2>Why it might matter</h2>
      <p>{synthesis.whyItMatters.text}</p>
      <h2>Bull case</h2>
      <ul>{synthesis.bullCase.map((item) => <li key={item.text}>{item.text}</li>)}</ul>
      <h2>Bear case</h2>
      <ul>{synthesis.bearCase.map((item) => <li key={item.text}>{item.text}</li>)}</ul>
      <h2>Open questions</h2>
      <ul>{synthesis.openQuestions.map((question) => <li key={question}>{question}</li>)}</ul>
    </section>
  );
}
```

Create `packages/ui/src/CardShell.tsx`:

```tsx
import type { ColdStartCard } from "@cold-start/core";
import { FactRow } from "./FactRow";
import { SourceDrawer } from "./SourceDrawer";
import { SynthesisSection } from "./SynthesisSection";

export function CardShell({ card, surface }: { card: ColdStartCard | Omit<ColdStartCard, "synthesis">; surface: "web" | "extension" }) {
  const synthesis = "synthesis" in card ? card.synthesis : undefined;

  return (
    <article className="cs-card" data-surface={surface}>
      <header>
        <h1 className="cs-title">{card.identity.name.value ?? card.domain}</h1>
        <p>{card.identity.oneLiner.value ?? "No cited one-liner found."}</p>
      </header>

      <section className="cs-section">
        <h2>Identity</h2>
        <FactRow label="Domain" fact={{ value: card.domain, status: "verified", confidence: "high", citationIds: [] }} mono />
        <FactRow label="HQ" fact={card.identity.hq} />
        <FactRow label="Founded" fact={card.identity.foundedYear} mono />
      </section>

      <section className="cs-section">
        <h2>Funding</h2>
        <FactRow label="Total raised" fact={card.funding.totalRaisedUsd} mono />
        <FactRow label="Last round" fact={card.funding.lastRound} />
      </section>

      <section className="cs-section">
        <h2>Team</h2>
        <FactRow label="Founders" fact={card.team.founders} />
        <FactRow label="Headcount" fact={card.team.headcount} mono />
      </section>

      {synthesis ? <SynthesisSection synthesis={synthesis} /> : null}
      <SourceDrawer citations={card.citations} />
    </article>
  );
}
```

Modify `packages/ui/src/index.ts`:

```typescript
export * from "./CardShell";
export * from "./CitationMarker";
export * from "./FactRow";
export * from "./SourceDrawer";
export * from "./SynthesisSection";
```

- [ ] **Step 4: Run UI tests**

Run: `npm test -w @cold-start/ui`

Expected: PASS.

- [ ] **Step 5: Typecheck UI and web**

Run: `npm run typecheck -w @cold-start/ui`

Expected: PASS.

Run: `npm run typecheck -w @cold-start/web`

Expected: PASS.

- [ ] **Step 6: Commit UI and prior web route work**

```bash
git add packages/ui apps/web
git commit -m "feat: render sourced company cards"
```

---

### Task 9: Extension-Origin Gated Synthesis API

**Files:**
- Create: `apps/web/src/lib/extension-auth.ts`
- Create: `apps/web/src/app/api/extension/cards/[slug]/route.ts`
- Create: `apps/web/src/app/privacy/page.tsx`

- [ ] **Step 1: Write route policy in code first**

Create `apps/web/src/lib/extension-auth.ts`:

```typescript
export function assertExtensionRequest(headers: Headers) {
  const origin = headers.get("origin") ?? "";
  const allowed = (process.env.ALLOWED_EXTENSION_ORIGINS ?? "chrome-extension://local-dev,http://localhost:5173")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!allowed.includes(origin)) {
    return { ok: false as const, status: 403, error: "extension origin required" };
  }

  return { ok: true as const };
}
```

Run: `npm run typecheck -w @cold-start/web`

Expected: PASS.

- [ ] **Step 2: Implement extension route**

Create `apps/web/src/app/api/extension/cards/[slug]/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { assertExtensionRequest } from "../../../../../lib/extension-auth";
import { getCachedCard } from "../../../../../inngest/functions";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const auth = assertExtensionRequest(request.headers);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { slug } = await params;
  const card = await getCachedCard(slug);

  if (!card) {
    return NextResponse.json({ error: "card not found" }, { status: 404 });
  }

  return NextResponse.json(card);
}
```

Create `apps/web/src/app/privacy/page.tsx`:

```tsx
export default function PrivacyPage() {
  return (
    <main className="cs-card-page">
      <article className="cs-card">
        <h1 className="cs-title">Privacy</h1>
        <p>Cold Start reads the company domain you ask it to analyze and stores public sources used to generate a cited company card.</p>
        <p>It does not scrape contacts, send outbound messages, act as a CRM, or make investment recommendations.</p>
        <p>The public card contains sourced facts only. Investor synthesis is available in the Chrome extension surface.</p>
      </article>
    </main>
  );
}
```

- [ ] **Step 3: Verify public route still strips synthesis**

Run a local manual check after a seeded card exists:

```bash
curl -s http://localhost:3000/api/cards/cartesia | rg '"synthesis"'
```

Expected: no matches.

- [ ] **Step 4: Verify extension route requires origin**

Run:

```bash
curl -i http://localhost:3000/api/extension/cards/cartesia
```

Expected: `403` with `extension origin required`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/extension-auth.ts apps/web/src/app/api/extension apps/web/src/app/privacy
git commit -m "feat: gate synthesis to extension route"
```

---

### Task 10: OG Image Generation And Public Metadata

**Files:**
- Create: `apps/web/src/app/c/[slug]/opengraph-image.tsx`
- Modify: `apps/web/src/app/c/[slug]/page.tsx`

- [ ] **Step 1: Add metadata expectation**

Modify `apps/web/src/app/c/[slug]/page.tsx`:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { publicCard } from "@cold-start/core";
import { CardShell } from "@cold-start/ui";
import { getCachedCard } from "../../../inngest/functions";

export const experimental_ppr = true;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const card = await getCachedCard(slug);
  const title = card?.identity.name.value ?? slug;
  const description = card?.identity.oneLiner.value ?? "Sourced company context card.";

  return {
    title: `${title} | Cold Start`,
    description,
    openGraph: {
      title: `${title} | Cold Start`,
      description,
      images: [`/c/${slug}/opengraph-image`]
    }
  };
}

export default async function CompanyCardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const card = await getCachedCard(slug);

  if (!card) {
    notFound();
  }

  return (
    <main className="cs-card-page">
      <CardShell card={publicCard(card)} surface="web" />
    </main>
  );
}
```

Run: `npm run typecheck -w @cold-start/web`

Expected: PASS.

- [ ] **Step 2: Implement OG image route**

Create `apps/web/src/app/c/[slug]/opengraph-image.tsx`:

```tsx
import { ImageResponse } from "next/og";
import { getCachedCard } from "../../../inngest/functions";

export const size = {
  width: 1200,
  height: 630
};

export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const card = await getCachedCard(slug);
  const name = card?.identity.name.value ?? slug;
  const oneLiner = card?.identity.oneLiner.value ?? "Sourced company context card.";
  const funding = card?.funding.totalRaisedUsd.value ? `$${Math.round(card.funding.totalRaisedUsd.value / 1_000_000)}M raised` : "public facts";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#FFFFFF",
          color: "#0A0A0A",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          fontFamily: "Arial"
        }}
      >
        <div>
          <div style={{ fontSize: 72, fontWeight: 800, lineHeight: 1 }}>{name}</div>
          <div style={{ fontSize: 28, color: "#6E6E76", marginTop: 28 }}>{oneLiner}</div>
          <div style={{ fontSize: 24, fontFamily: "monospace", marginTop: 40, background: "#F0EFEA", padding: "12px 16px", borderRadius: 4, width: "fit-content" }}>{funding}</div>
        </div>
        <div style={{ fontSize: 18, fontFamily: "monospace", color: "#B7B6B0" }}>coldstart.semitechie.vc</div>
      </div>
    ),
    size
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck -w @cold-start/web`

Expected: PASS.

- [ ] **Step 4: Manual image check**

Run with dev server running:

```bash
curl -I http://localhost:3000/c/cartesia/opengraph-image
```

Expected: `200` and `content-type: image/png` after a card exists.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/c
git commit -m "feat: add public card metadata and og image"
```

---

### Task 11: Chrome Extension Side Panel

**Files:**
- Create: `apps/extension/vite.config.ts`
- Create: `apps/extension/manifest.config.ts`
- Create: `apps/extension/index.html`
- Create: `apps/extension/sidepanel.html`
- Create: `apps/extension/src/domain.ts`
- Create: `apps/extension/src/background.ts`
- Create: `apps/extension/src/sidepanel.tsx`
- Create: `apps/extension/src/styles.css`
- Create: `apps/extension/tests/domain.test.ts`

- [ ] **Step 1: Write failing domain test**

Create `apps/extension/tests/domain.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { activeTabDomain } from "../src/domain";

describe("activeTabDomain", () => {
  it("extracts a bare domain from a tab URL", () => {
    expect(activeTabDomain("https://www.linear.app/customers")).toBe("linear.app");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @cold-start/extension`

Expected: FAIL with missing `src/domain`.

- [ ] **Step 3: Implement extension config and domain helper**

Create `apps/extension/vite.config.ts`:

```typescript
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import { defineConfig } from "vite";
import manifest from "./manifest.config";

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  server: {
    host: "127.0.0.1",
    port: 5173
  }
});
```

Create `apps/extension/manifest.config.ts`:

```typescript
import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "Cold Start",
  version: "0.1.0",
  description: "Sourced company context cards from the current tab.",
  permissions: ["sidePanel", "activeTab", "scripting", "storage"],
  action: {
    default_title: "Open Cold Start"
  },
  background: {
    service_worker: "src/background.ts",
    type: "module"
  },
  side_panel: {
    default_path: "sidepanel.html"
  },
  host_permissions: ["http://localhost:3000/*", "https://coldstart.semitechie.vc/*"]
});
```

Create `apps/extension/index.html`:

```html
<div id="root"></div>
```

Create `apps/extension/sidepanel.html`:

```html
<div id="root"></div>
<script type="module" src="/src/sidepanel.tsx"></script>
```

Create `apps/extension/src/domain.ts`:

```typescript
export function activeTabDomain(url: string): string {
  const parsed = new URL(url);
  return parsed.hostname.replace(/^www\./, "").toLowerCase();
}
```

- [ ] **Step 4: Implement user-gesture-safe background**

Create `apps/extension/src/background.ts`:

```typescript
import { activeTabDomain } from "./domain";

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    void chrome.sidePanel.open({ tabId: tab.id });
  }

  const domain = tab.url ? activeTabDomain(tab.url) : null;
  if (domain) {
    void chrome.storage.session.set({ activeDomain: domain });
  }
});
```

The `chrome.sidePanel.open()` call must stay before any awaited work.

- [ ] **Step 5: Implement side panel**

Create `apps/extension/src/styles.css`:

```css
@import "@cold-start/ui/tokens.css";

body {
  margin: 0;
  background: var(--color-canvas-parchment);
  color: var(--color-ink);
  font-family: var(--font-plex-sans);
}

.cs-extension-empty {
  padding: 20px;
}
```

Create `apps/extension/src/sidepanel.tsx`:

```tsx
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { ColdStartCard } from "@cold-start/core";
import { CardShell } from "@cold-start/ui";
import "./styles.css";

const apiOrigin = "http://localhost:3000";

function SidePanel() {
  const [domain, setDomain] = useState<string | null>(null);
  const [card, setCard] = useState<ColdStartCard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    chrome.storage.session.get("activeDomain", (items) => {
      const value = typeof items.activeDomain === "string" ? items.activeDomain : null;
      setDomain(value);
    });
  }, []);

  useEffect(() => {
    if (!domain) {
      return;
    }

    const slug = domain.split(".")[0];
    fetch(`${apiOrigin}/api/extension/cards/${slug}`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Card request failed with ${response.status}`);
        }
        return response.json() as Promise<ColdStartCard>;
      })
      .then(setCard)
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : String(caught)));
  }, [domain]);

  if (error) {
    return <div className="cs-extension-empty">{error}</div>;
  }

  if (!card) {
    return <div className="cs-extension-empty">{domain ? "Generating card..." : "Click Cold Start on a company tab."}</div>;
  }

  return <CardShell card={card} surface="extension" />;
}

createRoot(document.getElementById("root")!).render(<SidePanel />);
```

- [ ] **Step 6: Run tests and build**

Run: `npm test -w @cold-start/extension`

Expected: PASS.

Run: `npm run typecheck -w @cold-start/extension`

Expected: PASS.

Run: `npm run build -w @cold-start/extension`

Expected: PASS and writes `apps/extension/dist`.

- [ ] **Step 7: Commit**

```bash
git add apps/extension
git commit -m "feat: add chrome side panel extension"
```

---

### Task 12: Golden Eval Harness

**Files:**
- Create: `eval/golden-companies.seed.json`
- Create: `eval/README.md`
- Create: `eval/promptfoo.config.yaml`
- Modify: `package.json`

- [ ] **Step 1: Create seed set**

Create `eval/golden-companies.seed.json`:

```json
[
  { "name": "Cartesia", "domain": "cartesia.ai", "category": "ai-infra" },
  { "name": "Stripe", "domain": "stripe.com", "category": "payments" },
  { "name": "Linear", "domain": "linear.app", "category": "productivity" },
  { "name": "OpenAI", "domain": "openai.com", "category": "ai-lab" },
  { "name": "Anthropic", "domain": "anthropic.com", "category": "ai-lab" },
  { "name": "Cursor", "domain": "cursor.com", "category": "developer-tools" },
  { "name": "Perplexity", "domain": "perplexity.ai", "category": "search" },
  { "name": "Runway", "domain": "runwayml.com", "category": "creative-ai" },
  { "name": "Harvey", "domain": "harvey.ai", "category": "legal-ai" },
  { "name": "Scale AI", "domain": "scale.com", "category": "data" },
  { "name": "Databricks", "domain": "databricks.com", "category": "data" },
  { "name": "Figma", "domain": "figma.com", "category": "design" },
  { "name": "Notion", "domain": "notion.so", "category": "productivity" },
  { "name": "Airtable", "domain": "airtable.com", "category": "productivity" },
  { "name": "Ramp", "domain": "ramp.com", "category": "fintech" },
  { "name": "Brex", "domain": "brex.com", "category": "fintech" },
  { "name": "Rippling", "domain": "rippling.com", "category": "hr" },
  { "name": "Glean", "domain": "glean.com", "category": "enterprise-search" },
  { "name": "ElevenLabs", "domain": "elevenlabs.io", "category": "voice-ai" },
  { "name": "Mistral AI", "domain": "mistral.ai", "category": "ai-lab" },
  { "name": "Cohere", "domain": "cohere.com", "category": "ai-lab" },
  { "name": "Hugging Face", "domain": "huggingface.co", "category": "developer-tools" },
  { "name": "Character.AI", "domain": "character.ai", "category": "consumer-ai" },
  { "name": "Together AI", "domain": "together.ai", "category": "ai-infra" },
  { "name": "Fireworks AI", "domain": "fireworks.ai", "category": "ai-infra" },
  { "name": "Modal", "domain": "modal.com", "category": "compute" },
  { "name": "LangChain", "domain": "langchain.com", "category": "developer-tools" },
  { "name": "Pinecone", "domain": "pinecone.io", "category": "vector-db" },
  { "name": "Weaviate", "domain": "weaviate.io", "category": "vector-db" },
  { "name": "Chroma", "domain": "trychroma.com", "category": "vector-db" },
  { "name": "Supabase", "domain": "supabase.com", "category": "developer-tools" },
  { "name": "Vercel", "domain": "vercel.com", "category": "developer-tools" },
  { "name": "Neon", "domain": "neon.tech", "category": "database" },
  { "name": "PlanetScale", "domain": "planetscale.com", "category": "database" },
  { "name": "Retool", "domain": "retool.com", "category": "internal-tools" },
  { "name": "Hex", "domain": "hex.tech", "category": "analytics" },
  { "name": "MotherDuck", "domain": "motherduck.com", "category": "analytics" },
  { "name": "Baseten", "domain": "baseten.co", "category": "ai-infra" },
  { "name": "Anysphere", "domain": "anysphere.co", "category": "developer-tools" },
  { "name": "Clay", "domain": "clay.com", "category": "gtm" },
  { "name": "Mercury", "domain": "mercury.com", "category": "fintech" },
  { "name": "Deel", "domain": "deel.com", "category": "hr" },
  { "name": "Navan", "domain": "navan.com", "category": "travel" },
  { "name": "Wiz", "domain": "wiz.io", "category": "security" },
  { "name": "Gong", "domain": "gong.io", "category": "sales" },
  { "name": "Plaid", "domain": "plaid.com", "category": "fintech" },
  { "name": "Adyen", "domain": "adyen.com", "category": "payments" },
  { "name": "Palantir", "domain": "palantir.com", "category": "public-company" },
  { "name": "Snowflake", "domain": "snowflake.com", "category": "public-company" },
  { "name": "Shopify", "domain": "shopify.com", "category": "public-company" }
]
```

- [ ] **Step 2: Add eval docs and config**

Create `eval/README.md`:

```markdown
# Cold Start Eval Harness

This folder holds the starter 50-company golden set and prompt regression config.

Manual score each generated card on:

- Identity correct
- Funding correct or hidden when not cited
- Leadership correct or hidden when not cited
- No fabricated citation URLs
- Public route omits synthesis
- Extension route includes synthesis only when allowed origin is present
```

Create `eval/promptfoo.config.yaml`:

```yaml
description: Cold Start cited extraction regression
prompts:
  - "Extract only cited company facts from the provided sources. Drop unsupported claims."
providers:
  - id: echo
tests:
  - vars:
      domain: cartesia.ai
    assert:
      - type: contains
        value: cited
```

Modify root `package.json` scripts:

```json
{
  "eval:seed": "node -e \"const data=require('./eval/golden-companies.seed.json'); console.log(data.length)\""
}
```

Keep the existing scripts and add only `eval:seed` under `"scripts"`.

- [ ] **Step 3: Verify seed count**

Run: `npm run eval:seed`

Expected: `50`.

- [ ] **Step 4: Commit**

```bash
git add eval package.json package-lock.json
git commit -m "test: add golden company eval seed"
```

---

### Task 13: End-To-End Verification And Launch Hardening

**Files:**
- Modify: `README.md`
- Create: `apps/web/src/app/robots.ts`
- Create: `apps/web/src/app/sitemap.ts`

- [ ] **Step 1: Add robots and sitemap**

Create `apps/web/src/app/robots.ts`:

```typescript
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/c/", "/c/*/opengraph-image"],
      disallow: ["/api/extension/"]
    }
  };
}
```

Create `apps/web/src/app/sitemap.ts`:

```typescript
import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://coldstart.semitechie.vc",
      lastModified: new Date()
    }
  ];
}
```

- [ ] **Step 2: Update README implementation status**

Modify the `Status` section in `README.md` to:

```markdown
## Status

Implementation plan generated 2026-05-06 at `docs/superpowers/plans/2026-05-06-cold-start-implementation.md`.

Execution gates:

- Week 1: backend + claim store
- Week 2: public web card
- Week 3: Chrome extension + launch hardening
```

- [ ] **Step 3: Run full validation**

Run:

```bash
npm test --workspaces --if-present
```

Expected: PASS.

Run:

```bash
npm run typecheck --workspaces --if-present
```

Expected: PASS.

Run:

```bash
npm run build --workspaces --if-present
```

Expected: PASS for packages, web, and extension.

- [ ] **Step 4: Manual product checks**

Start web:

```bash
npm run dev -w @cold-start/web
```

Expected: local server at `http://localhost:3000`.

Check public route after seeding `cartesia`:

```bash
curl -s http://localhost:3000/api/cards/cartesia | rg '"synthesis"'
```

Expected: no matches.

Check extension route without origin:

```bash
curl -i http://localhost:3000/api/extension/cards/cartesia
```

Expected: `403`.

Check OG image:

```bash
curl -I http://localhost:3000/c/cartesia/opengraph-image
```

Expected: `200` and `content-type: image/png`.

- [ ] **Step 5: Commit**

```bash
git add README.md apps/web/src/app/robots.ts apps/web/src/app/sitemap.ts
git commit -m "chore: add launch verification surfaces"
```

---

## Self-Review Results

Spec coverage:
- Public sourced facts at `/c/{slug}`: Tasks 7, 8, 9, 10.
- Gated synthesis behind extension: Tasks 5, 8, 9, 11.
- AgentCash stableenrich primary with direct fallback: Task 4.
- Next.js 15, Vercel-friendly App Router, PPR, Suspense path: Tasks 7, 10.
- Neon Postgres and claim store: Task 3.
- Inngest background generation: Task 7.
- Claude Sonnet extraction, synthesis, verifier with prompt caching: Task 5.
- Chrome MV3 side panel: Task 11.
- Design system from `DESIGN.md`: Task 8.
- Golden eval set: Task 12.
- Launch privacy and metadata: Tasks 9, 10, 13.

Placeholder scan:
- No task uses deferred implementation language.
- Known unknowns are handled as executable config checks or spike outcomes, not hidden assumptions.

Type consistency:
- `ColdStartCard`, `ResolvedFact`, `Citation`, and `SourcedText` are defined once in `packages/core/src/card.ts`.
- `publicCard`, `sanitizeCardTrust`, and `stripUnsupportedSynthesis` are defined in Task 2 and reused by db and web tasks.
- `companySlugFromDomain` and `canonicalDomain` are defined in Task 2 and reused by pipeline, web, and extension logic.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-06-cold-start-implementation.md`. Two execution options:

1. Subagent-Driven (recommended) - dispatch a fresh subagent per task, review between tasks, fast iteration

2. Inline Execution - execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
