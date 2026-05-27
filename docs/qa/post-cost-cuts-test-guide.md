# Post-Cost-Cuts Test Guide

How to manually verify the May 2026 cost-optimization changes, the Financing & Valuation research-layer card, and the redesigned comparables curation. Designed to be runnable end-to-end without context.

## 1. Deploy to Vercel

Run from the repo root (NOT from `apps/web/`). The `.vercel/project.json` link lives at the repo root and `vercel deploy` must be invoked from where the link sits, otherwise the CLI links a new project on the fly.

```bash
cd /Users/samaydhawan/Projects/active/cold-start
npx vercel deploy --prod --yes --scope samay58s-projects
```

**Expect:** the CLI uploads, builds, and prints a production URL. The deployment promotes to `https://cold-start-samay58s-projects.vercel.app`.

If a stray `apps/web/.vercel/` directory exists, delete it before deploying:

```bash
rm -rf /Users/samaydhawan/Projects/active/cold-start/apps/web/.vercel /Users/samaydhawan/Projects/active/cold-start/apps/web/.env.local
```

## 2. Smoke-test the live API

```bash
TOKEN="$(cat /Users/samaydhawan/Projects/active/cold-start/.vercel/extension-api-token.production.local)"

# Public route must NOT leak synthesis:
curl -s https://cold-start-samay58s-projects.vercel.app/api/cards/cartesia | jq '.domain, has("synthesis")'
# Expect: "cartesia.ai" and false

# Extension route returns the full card when authed:
curl -s https://cold-start-samay58s-projects.vercel.app/api/extension/cards/cartesia \
  -H "x-cold-start-extension-id: YOUR-LOADED-EXTENSION-ID" \
  -H "authorization: Bearer $TOKEN" \
  | jq '.domain, has("synthesis"), (.funding.investors.value // [] | length)'
# Expect: "cartesia.ai", true, and a number of investors
```

To get YOUR-LOADED-EXTENSION-ID, open `chrome://extensions` (or `dia://extensions`) in the browser you've loaded the unpacked extension into and copy the ID under the Cold Start entry.

## 3. Rebuild and load the extension

```bash
cd /Users/samaydhawan/Projects/active/cold-start
npm run build -w @cold-start/extension
```

In Dia or Chrome:

1. Open `chrome://extensions` (works in Dia too).
2. Toggle **Developer mode** on (top-right).
3. If Cold Start is already loaded: click the **Reload** ↻ icon on its card.
4. Otherwise: **Load unpacked** → select `/Users/samaydhawan/Projects/active/cold-start/apps/extension/dist`.

## 4. Verify the Money research module

1. Open a tab to a cached company. Good cached options: `cartesia.ai`, `elevenlabs.io`, `legora.com`, `attio.com`, `skyfire.xyz`.
2. Click the Cold Start icon to open the side panel.
3. Scroll to the research module workbench near the bottom of the side panel.

**Expect to see the modules in this order:** Why care, Who pays, Timing, Proof, Signals, Money, Comps, Product, Next question.

4. Open or pin the Money module.

**Expect inside the Money module:**

- Title: Money
- Headline row reads like `$91M raised · 4 rounds`
- Body line: `4 named investors: Kleiner Perkins, Lightspeed, Index Ventures, …`
- One row per round: round name + date on the right + body line with amount and lead investors
- Source chips at the bottom

## 5. Verify the comparables redesign

Open the Comps module the same way.

**Expect 3–5 distinct companies, each with:**

- A real company name (not a directory or alternate domain)
- A oneLiner drawn from the source page text
- A per-comp `basis` like `Same buyer: enterprise legal teams` or `Workflow overlap: voice synthesis API`. NOT the old `Similar web and market context from Exa find-similar` boilerplate

If you see fewer than 3 comps that's intentional. The new prompt prefers fewer real comps over fabricating filler.

## 6. Verify the cost cuts are in effect

```bash
set -a; source /Users/samaydhawan/Projects/active/cold-start/.env.production.migrate.local; set +a
cd /Users/samaydhawan/Projects/active/cold-start
npm run trace:generation -- --limit 5 --detail
```

In the most-recent trace, expect:

- Step list contains `fetch-sources`, `generate-card`, `load-existing-card`, `upsert-card`, `record-card-evidence`, `record-sources`, `mark-generation-complete`.
- **NO `repair-underfilled-basics` step with `status: complete`** (only `skipped`, which is now its only outcome).
- **NO `email-backfill` step at all** (it was deleted).
- For analysis runs: **NO `plan-research` LLM call**. The step runs in zero milliseconds using the fallback plan.
- `extraction.providerFactPaths` no longer lists `"comparables"` (those now come from the LLM block, not from stableenrich).
- `extraction.blockEnrichment.produced` typically shows 2–4 of the 5 blocks for well-covered domains (was almost always 5).

## 7. End-to-end spend check with a real generation

Top up AgentCash first:

```bash
npx agentcash@latest list-accounts
# Use the deposit link for "base" network; topping up a few dollars is enough for tests
npx agentcash@latest balance
```

Then queue a generation against the live API:

```bash
TOKEN="$(cat /Users/samaydhawan/Projects/active/cold-start/.vercel/extension-api-token.production.local)"

curl -i -X POST https://cold-start-samay58s-projects.vercel.app/api/generate \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $TOKEN" \
  -H "x-cold-start-extension-id: YOUR-LOADED-EXTENSION-ID" \
  -d '{"domain":"legora.com","confirmStart":true,"mode":"basics","forceRefresh":true}'
```

Wait ~30–60 seconds, then:

```bash
npm run trace:generation -- --domain legora.com --quality --detail
```

**Expect on the AgentCash side:** ~$0.03–$0.05 USDC spend per basics card (Apollo + Hunter + small Exa fees). Compared to before, you should see roughly half the Apollo+Hunter call count and no email-backfill block in the trace.

## 8. Visually inspect the regenerated card

Open the side panel for the just-regenerated company. The Financing & Valuation card should now reflect the fuller extraction (more named investors, exact amounts), and the Competitive Position card should show curated comps with cited per-comp basis text.

## Targets

After these changes, expected per-card cost on the live API:

| Mode | Before | After |
|---|---:|---:|
| Basics | ~$1.35 | ~$0.75 |
| Analysis (basics + synthesis + verifier) | ~$1.48 | ~$0.88 |

Roughly 40–45% reduction per card. The dominant savings came from deleting the second-pass `email-backfill` (~$0.20 AgentCash) and the auto-retry `repair-underfilled-basics` (~$0.20–0.65 Anthropic amortized).
