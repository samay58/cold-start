# Evidence and judgment remediation plan

> **For agentic workers:** Run this in a fresh session, one task at a time. Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax. Stop at every gate marked **Samay decides** and wait.

**Goal:** Make Cold Start's reads better by giving the models better evidence and fewer, clearer rules, not more rules.

**Why now:** The September 22 judge comparison (Opus 5 against Opus 5.5 on 8 companies) showed that the reads depend less on which model we pick than on two things we control: what evidence reaches the model, and whether our rules ask for proof that private companies never publish.

**Spec and sources:** the findings below, `docs/superpowers/specs/2026-08-21-how-it-wins-judgment-standard.md`, `docs/superpowers/specs/2026-08-21-how-it-wins-strategy-rubric.md`, `docs/superpowers/specs/2026-09-22-how-it-wins-layered-screen.md`, and the comparison runs in `eval/curation/how-it-wins-batch/2026-09-22-1734` (Opus 5) and `2026-09-22-2154` (Opus 5.5).

## Guardrails: how to avoid brittle, over-built fixes

Samay trusts the models' underlying intelligence and does not want it hobbled. Every task follows these rules.

1. Fix inputs before instructions. A model that reads the page will out-reason any rule we write about pages it could not read.
2. Subtract before adding. The rule count in a prompt must not grow. If a change adds a sentence, name the sentence it replaces.
3. State the purpose, not the procedure. Tell the model what the reader needs and why. Do not script its steps.
4. Keep only the hard lines that protect the product: cite evidence, use only the supplied evidence, never invent a number.
5. No patches aimed at one company, one strategy, or one model. No regex filters on model output. A fix that helps only Opus 5.5 is the wrong fix.
6. Judge results by Samay's reading, on a fixed set of companies, with at least two runs per arm before drawing a conclusion. Counts are monitors, not goals.
7. Every paid run has a stated cap. Ask before any run over $10.

## Hygiene

1. Fix a bug at its source, then delete the downstream workarounds it made necessary, such as the JSON gate in `clipping-model.ts`. A workaround that stays hides the next bug.
2. One helper per job. Snippet building gets one shared function and one length constant, used by every builder. Sentence cutting uses `packages/core/src/sentences.ts`.
3. Every fix ships with a test that pins the invariant, not just the example. The invariant here: no text a model reads as evidence is serialized JSON.
4. Small commits, one reason each, with messages in the repo's plain style. `npm run check` stays green after every commit. Read its full output; never pipe it through `tail`.
5. Source files stay under 1,000 lines and the size allowlist only shrinks (`scripts/check-file-size.ts`).
6. Update `AGENTS.md`, `docs/code-map.md` and `docs/STATUS.md` in the same commit as a change that makes them wrong.
7. Before each commit, check `git status` for concurrent work from other sessions. Never clean the tree with checkout or stash.
8. No production write, deploy, migration or environment change without Samay's approval. Production reads for measurement are fine, and read-only.

## What we learned (verified September 23, 2026)

1. **Almost a third of all citation snippets are empty, product-wide.** Across the 373 corpus profiles, 1,826 of 6,036 citations (30%) have a snippet that is search-result metadata with no page text: an ID, a title, a URL and a date. 282 of 373 profiles have at least one. For the How it wins judge on the 8 test companies, it was 59 of 178 evidence items, including every Notion item from our search provider.
   - Cause: providers store raw records as JSON text. `packages/providers/src/direct-exa.ts:384` and `:369` store `JSON.stringify(record)`, and `packages/providers/src/stableenrich/facts.ts`, `people.ts` and `discovery.ts` do the same. Exa does return the page text (`contents: { text: true, highlights }` at `direct-exa.ts:69-72`), but in the JSON the text comes after the metadata.
   - The snippet builders then keep only the first few hundred characters, which is all metadata: `packages/pipeline/src/provider-facts.ts:213` (`p` citations, 887 of 1,008 empty), `apps/web/src/inngest/source-fetching.ts:102` (`s` citations, 872 of 894 empty), and `packages/pipeline/src/seed-profile.ts:140` and `:263` (`c` and seed citations).
   - Every model stage that judges reads the snippet: the How it wins judge (`packages/llm/src/how-it-wins-judge-rules.ts:90`), the synthesis prompt (it receives `card.citations`), the verifier that drops unsupported bull and bear claims (`packages/pipeline/src/generate-card.ts:1064-1069`), and the emphasis read's source digests (`packages/core/src/emphasis-read.ts:74`). Likely consequence, not yet measured: the verifier drops true claims because the source it checks against is empty, and that thins the Investor Lens.
   - Extraction and research sections read `rawText` directly (`packages/llm/src/extraction.ts:287`, `apps/web/src/inngest/research-section-generation.ts:53`). They get the page text, but inside JSON, which spends their character budget on keys, URLs and image links.
   - The extension already works around this downstream (`apps/extension/src/company/clipping-model.ts:91`: "Most snippets are raw provider JSON"). The workaround hid the bug instead of fixing it.
   - A readable-text helper already exists: `rawRecordText` at `direct-exa.ts:555`.
   - A second, likely bias: the ledger's snippet chooser (`packages/pipeline/src/evidence-ledger.ts:113-133`) prefers sentences containing funding words ("raised", "series", "valuation", "investor"). 1,740 of 3,300 working `e` snippets mention one. The judge's evidence about how a company wins may skew toward funding news. Verify in Task 1.
2. **Evidence items are short even when they work.** The median item the judge sees is 223 characters. The maximum is 700.
3. **The judge never sees source dates.** `how-it-wins-judge-rules.ts:89-94` sets `sourceDate: null` for every item, although the standard asks whether a mechanism is live today.
4. **Corrected by the audit: Opus 5 did not fill gaps from memory.** It marked Notion's composability as current by citing block primitives. No citable evidence item says "block", but the card's description in the judge's `context` does ("Block-based editor where pages, databases, and views ... are composable primitives"), written by extraction from page text. Opus 5 used the description; Opus 5.5 refused a claim with no evidence item behind it. The real fault is that the page text never reached the evidence list (audit finding 8).
5. **Opus 5.5 skips work.** The standard lets the judge write a one-line ruling when a strategy "fails the evidence gate", and the judge decides that for itself. Opus 5.5 did so for 50 to 58 of 80 strategies per company, against 13 to 36 for Opus 5. On DeepInfra's low friction it wrote "no behaviour change or edge over peers is shown" while the packet held revenue tripling, 25x token growth and 30% of volume from agents.
6. **Our rules keep asking for head-to-head proof.** The Specialization row demands a fit "that broader rivals demonstrably lack". The distinctiveness test calls a trait category baseline "if two comparable companies share the trait". The rubric already accepts three kinds of proof: "a measured result, a capability they do not have, or customers choosing on that fit". Opus 5.5 reads it as head-to-head results only.
7. **Profiles keep stating what private companies never publish.** A narrow text match finds such lines in at least 130 of 373 corpus profiles (`eval/curation/corpus/cards`). The real rate is higher, because the match misses many phrasings. The main sources are research-section items (101 hits), expanded-description paragraphs (56), research-section summaries (31), napkin-math bases and bear-case claims. The prompts behind this include `packages/llm/src/expanded-description.ts:78` and the research-section rules in `packages/core/src/research-sections.ts:113-125`. The emphasis read's "Quiet" line is an absence list by design (`packages/llm/src/emphasis-read.ts:44`).
8. **The comparison itself was not controlled.** The Opus 5 verdicts came from about 3:45 PM on September 22, under a forced tool choice. The Opus 5.5 run came after `4830c3c` (10:02 PM), which moved every stage to `tool_choice: auto`. Each model ran once. Neither accepts a temperature setting, so run-to-run variation is unmeasured.
9. **The Task 1 audit found more of the same kind** (`docs/qa/model-input-audit-2026-09.md`): eight paid Exa searches never ask for page text, so 37% of stored sources hold only a title; person reads get JSON about someone else; the evidence leans toward funding in the queries, the ledger and the snippets; a company's own pages reach the judge labeled as outside sources; publish dates are dropped before storage; a keyword filter deletes verified claims; and four workarounds hide the JSON bug.

## Decisions reserved for Samay

- The exact wording of every prompt or rubric sentence changed in Tasks 3 and 4. The judgment standard is his.
- Whether the emphasis read keeps its "Quiet" line (Task 3).
- Which judge model to keep, after his blind reading (Task 5).
- Whether to turn on `HOW_IT_WINS_SCREEN=scoped` (Task 5).
- Any paid run over $10, and every production deploy.
- Whether to backfill existing production profiles (Task 2, E7), and when the dates migration runs in production (Task 2B).
- Already decided, September 23: every audit finding is in scope (Task 1).

## Review focus

The failure modes most likely to bite, each pinned to a task:

1. A search result with no `text`, `summary` or `highlights` falls back to a title, not to JSON. (Task 2 test.)
2. Page text that is boilerplate, such as cookie banners or nav menus, displaces real content. (Task 2 check on 12 packets.)
3. Longer evidence pushes the judge past its timeout or its budget. The judge prompt is already about 19k input tokens. (Task 2 check: record judge input tokens and latency before and after.)
4. New evidence text changes the evidence-packet hash, so memoized judgments (`how_it_wins_judgments`) miss and re-files pay again. This is expected once; confirm it settles. (Task 2 note in the commit and STATUS.)
5. The "do not state normal absences" principle hides a gap that matters, such as a company claiming revenue with no source. (Task 3 check on one known case.)
6. Existing production profiles keep their empty snippets after the fix ships, so testers see no change on companies already built. (Task 2, E7 backfill decision.)
7. Old stored rows are JSON and new rows may not be, so any reader that sees both must handle both. (Task 2, B3 test d.)
8. Page text from a person database or a list page names many people, so a person read picks up someone else. (Task 2, C1.)
9. Asking Exa for page text makes sources much longer, so extraction's character budget now drops sources it used to keep. (Task 2, E3: compare which sources reach the extraction prompt before and after.)

---

### Task 0: Fix the comparison set and freeze a baseline (done)

Done September 23, 2026 in `057bde4`. The 12 slugs and the baseline are in `eval/curation/remediation-2026-09/README.md`.

No product code. This set is reused by every later task, so later results are comparable.

**Files:**
- Create: `eval/curation/remediation-2026-09/README.md` (the set, the baseline paths, the costs)

- [ ] **Step 1:** Use the 8 companies from the September 22 runs: august, bland, cognition, deepinfra, doppel, hebbia, nekohealth, notion.
- [ ] **Step 2:** Add 4 non-holdout corpus cards from `eval/curation/corpus/cards`, one of each: a thin file, a marketplace, a hardware or physical-world company, and a later-stage company with press coverage of its finances. Check each against the holdout list used by `scripts/how-it-wins-batch.ts`. Record the 12 slugs in the README.
- [ ] **Step 3:** Save the two monitors below as `eval/curation/remediation-2026-09/monitors.py`. The first counts empty evidence items in saved judgments. The second counts lines that name missing information in corpus cards. Both are rough monitors, never pass-fail gates.

```python
import json, glob, re, statistics, sys

def evidence_stubs(judgment_glob):
    for path in sorted(glob.glob(judgment_glob)):
        registry = json.load(open(path))["evidenceRegistry"]
        stubs = [e["evidenceId"] for e in registry if e["text"].lstrip().startswith("{")]
        lengths = [len(e["text"]) for e in registry]
        print(path.split("/")[-1][:8], "items", len(registry), "stubs", len(stubs), "median", int(statistics.median(lengths)))

ABSENCE = re.compile(
    r"not (publicly )?disclosed|undisclosed|isn'?t (public|disclosed)|not public|"
    r"no public (data|figure|disclos|record|evidence|information)|nothing (filed|public) shows|"
    r"no (disclosed|public|reported) (revenue|pricing|margin|financ|customer|metric)|"
    r"no (revenue|financial|pricing) (data|figure|disclos)|has not (disclosed|published|shared)|"
    r"does not (disclose|publish)|without (disclosed|public) ",
    re.I,
)

def strings(node, path=""):
    if isinstance(node, dict):
        for key, value in node.items():
            yield from strings(value, f"{path}.{key}")
    elif isinstance(node, list):
        for value in node:
            yield from strings(value, f"{path}[]")
    elif isinstance(node, str):
        yield path, node

def absence_lines(card_paths):
    profiles_hit = 0
    for path in card_paths:
        hits = [s for p, s in strings(json.load(open(path)))
                if ".citations" not in p and ".sources" not in p and ABSENCE.search(s)]
        profiles_hit += bool(hits)
        print(path.split("/")[-1], len(hits))
    print("profiles with at least one absence line:", profiles_hit, "of", len(card_paths))

if __name__ == "__main__":
    evidence_stubs("eval/curation/how-it-wins-batch/_judgments/*.json")
    absence_lines(sys.argv[1:])
```

- [ ] **Step 4:** Record the baseline for each of the 12 with `python3 eval/curation/remediation-2026-09/monitors.py <the 12 card paths>`: evidence items, JSON-stub items, median item length, absence lines, and the current How it wins verdicts, where they exist, from `eval/curation/how-it-wins-batch/_judgments`.
- [ ] **Step 5:** Commit: `Record the fixed comparison set for the evidence remediation`.

**Finish line:** a README listing 12 slugs and their baseline numbers.

---

### Task 1: Audit what every model actually sees and keeps (done)

Done September 23, 2026 in `030948c`. `npm run qa:model-inputs -- --slug <slug>` (`scripts/dump-model-inputs.ts`) saves the exact request each stage would send, without calling a model. The findings, their causes and their reach are in `docs/qa/model-input-audit-2026-09.md`. Read it before Task 2; the tasks below cite its finding numbers.

Samay's decisions, September 23, 2026: every finding is in scope. A: findings 1, 2, 4, 6 and 10 join Task 2. B: yes, ask for page text in every Exa search. C: dates get an optional citation field and a `sources.published_at` column (Task 2B). D: remove the keyword gate (Task 2C). E: a snippet is the page's own text, and search queries that are not about funding lose their funding words (Task 2).

---

### Task 2: Give every model the page text

The biggest single gain. It is a bug, not a judgment call, and it reaches every model stage. It has five parts. Do them in order; each part ends with green tests and its own commits.

**Files (find exact lines with the audit and `rg`; they drift):**
- Fetch: `packages/providers/src/stableenrich/core.ts` (the Exa search and find-similar bodies), `packages/providers/src/provider-budget.ts`
- Store: `packages/providers/src/direct-exa.ts:369,384`, `packages/providers/src/stableenrich/facts.ts`, `people.ts`, `discovery.ts`
- Snippet builders (audit finding 10 inventory): `packages/pipeline/src/provider-facts.ts`, `packages/pipeline/src/seed-profile.ts`, `packages/pipeline/src/generate-card.ts` (the e-citation snippet), `packages/pipeline/src/evidence-ledger.ts`, `apps/web/src/inngest/source-fetching.ts`, `apps/web/src/inngest/generation-helpers.ts` (progress events), `packages/db/src/repositories/sources.ts` (`compactSnippet`), `apps/web/src/app/api/extension/bootstrap/route.ts`
- Model evidence builders: `packages/llm/src/extraction.ts` (`evidenceForExtractionPrompt`), `apps/web/src/inngest/research-section-generation.ts` (`evidenceForSection`), `packages/pipeline/src/expanded-description-evidence.ts`, `packages/pipeline/src/person-read-evidence.ts`, `packages/core/src/emphasis-read.ts`, `packages/llm/src/how-it-wins-judge-rules.ts`
- Workarounds to delete: `apps/extension/src/company/clipping-model.ts`, `packages/core/src/prose.ts`, `packages/core/src/first-payoff.ts` (`readableSourceText`), `packages/providers/src/founder-voice/exa-web.ts` (`textFromRawRecord`)
- Tests: the existing test file for each module under its package's `tests/` folder

**Interfaces this task produces (later tasks rely on them):**
- One function that turns a stored source record into readable text: page text, then summary, then highlights, then title. It never returns JSON.
- One snippet builder with one length constant (about 600 characters) that cuts at a sentence boundary with `packages/core/src/sentences.ts`.
- Name them to match the surrounding code. Record the final names in the ledger.

#### Part A: fetch the text (audit findings 1 and 5)

- [ ] **A1.** Confirm the cost first. Run `mcp__agentcash__check_endpoint_schema` (free, no payment) on `https://stableenrich.dev/api/exa/search` and `https://stableenrich.dev/api/exa/find-similar`, with a sample body that includes `contents: { text: true, highlights: {...} }`. The search quoted $0.01 on September 23, the same as without text. If either quote is higher, record it and update the estimate in `provider-budget.ts`.
- [ ] **A2.** Write failing tests: every stableenrich Exa search and find-similar body asks for page text. Use one shared `contents` constant, like the one `direct-exa.ts:69-72` already uses. Do not copy it per probe.
- [ ] **A3.** Add `contents` to the eight searches and find-similar. Update `provider-budget.ts` in the same commit.
- [ ] **A4.** Remove funding words from the default queries that are not about funding: company profile, recent signals, independent analysis, customer proof and product proof. Keep the funding-history query as it is. Write each query as the plain thing it looks for. Show Samay the before and after query text in the report. It is technical wording, not voice, so there is no gate, but he reads it.
- [ ] **A5.** Commit: `Ask every Exa search for page text`, then separately `Keep funding words out of searches that are not about funding`.

#### Part B: read the text (findings 2, 5 and 6)

- [ ] **B1. Find every reader of `rawText` before changing it.** Run `rg -n 'rawText|raw_text' packages apps -g '*.ts' -g '!**/tests/**'`. List each reader in the ledger and say whether it parses JSON. Known parsers: `people-search-hints.ts`, `first-payoff.ts`, `exa-web.ts`, and the fact extractors in `stableenrich/facts.ts`.
- [ ] **B2. Choose the narrowest safe fix** and record why in the commit message. If a reader needs structured fields, keep `rawText` as it is and fix every builder through the readable-text function. If nothing needs the JSON, store readable text in `rawText` and keep the metadata in fields that already exist (`title`, `url`, `publishedAt`). Either way, existing production rows stay JSON, so the readable-text function must accept both forms.
- [ ] **B3. Write the failing tests.** (a) An Exa record with `text` gives page text, not `{`. (b) Only `highlights` gives the highlights. (c) None of the three gives the title, never JSON. (d) A stored JSON row and a stored plain-text row both come out readable. (e) One invariant test over a card built through the real pipeline helpers: no citation snippet, and no evidence text in the judge packet, the verifier's sources, the emphasis digests, the person-read evidence, the research-section evidence, the expanded-description evidence or the extraction prompt, parses as JSON or starts with `{`. Run each package's tests with `npm run test -w <package> -- <file>` and watch them fail. Never `npx vitest run -w`, which starts watch mode.
- [ ] **B4. Implement.** Route every builder in the Files list through the readable-text function and the one snippet builder. The evidence ledger picks supporting sentences from readable text, not from the JSON string.
- [ ] **B5. Who writes the snippet (decision E).** A citation's snippet is the page's own text, cut at a sentence. Keep a model-written snippet from extraction only when the source has no readable text. Drop the ledger's funding-keyword preference (`evidence-ledger.ts:113-133`) and the funding-intent ranking bonus (`:108`) unless a test shows funding extraction needs them. If it does, keep them only on the funding path.
- [ ] **B6. Labels (finding 6).** In `howItWinsEvidencePacketFromCard`, compute each item's attribution with `sourceQualityForSource(citation, { targetDomain: card.domain })`, so a company's own pages are always labeled as the company speaking. Use the tier vocabulary only; never fall back to `sourceType` names. Test with a notion.com page typed `news`.
- [ ] **B7.** Commit in small pieces: the readable-text function and snippet builder with their tests; the call sites; the labels. The first message says that memoized How it wins judgments will miss once, because the evidence hash changes.

#### Part C: person reads (finding 4)

- [ ] **C1.** Failing tests: evidence for a person is a window of readable text around their name, not the first 700 characters. An item that never names the person is not sent. A person listed as both founder and executive is read once. Suppression reasons (`thin_evidence`, `no_nonobvious_claim`, `truncated`) reach the trace step, not only a count.
- [ ] **C2.** Implement in `person-read-evidence.ts` and `contact-enrichment.ts`. Commit: `Give person reads text about the person, once`.

#### Part D: delete the workarounds (finding 10)

- [ ] **D1.** Delete the JSON handling in `clipping-model.ts`, `prose.ts`, `first-payoff.ts` and `exa-web.ts`. Replace each with the shared readable-text function where old stored rows can still reach it. Update their tests.
- [ ] **D2.** Route the progress-event snippets and the extension bootstrap snippets through the shared snippet builder.
- [ ] **D3.** Commit: `Remove the JSON workarounds now that snippets are readable`.

#### Part E: measure

- [ ] **E1. Rebuild the 12 packets for free.** Write a read-only script in `scripts/` that rebuilds each card's citation snippets from production `sources.raw_text` with the new builders. It loads `.env.production.migrate.local`, the way `scripts/dump-model-inputs.ts` does. Save the cards under `eval/curation/remediation-2026-09/cards/`. No database writes.
- [ ] **E2. Re-fetch the 12 with page text, capped at $3.** Rows stored without text (finding 1) stay title-only in E1. Call only the stableenrich Exa searches for the 12 companies with the new `contents` (about 9 calls × 12 × $0.01). Merge the results into the rebuilt cards by URL. Save the raw responses under the same folder so no search is paid twice. Report the actual spend.
- [ ] **E3. Check by eye.** For Notion, DeepInfra and casaphq, rerun `npm run qa:model-inputs` against the rebuilt cards (add a `--card <path>` option if needed) and read every stage's evidence. Confirm that items are page content, that none is boilerplate such as cookie banners or menus, and that Notion's items include the text of the notion.so homepage and the developer-platform post. Record JSON stubs (target 0), title-only items, and median item length with `monitors.py`.
- [ ] **E4. One paid judge check, capped at $3.** Run the judge once, on the production model (Opus 5), for 2 rebuilt cards with `scripts/how-it-wins-batch.ts`. Record input tokens, latency and cost against the baseline. Stop and report if latency rises more than 30% or any call times out.
- [ ] **E5. Measure the verifier, capped at $2.** Rerun only the verifier on the production model (`deepseek-v4-flash`, not Sonnet) over the 12 cards' current synthesis, once with the old snippets and once with the rebuilt ones. Count claims kept. This is where audit finding 3 is confirmed or ruled out.
- [ ] **E6.** Run `npm run check` from the repo root and read the full output. Do not pipe it through `tail`.
- [ ] **E7. Samay decides** whether to backfill existing production profiles. New profiles get clean snippets after deploy; the roughly 400 existing ones keep empty ones until they are re-filed or backfilled. A backfill rebuilds snippets from `sources.raw_text` with the same builders. Rows with no stored text cannot be backfilled without paying for a re-fetch. It is a production write, so it needs approval, a dry run that prints the counts it would change, and a readback afterward.

**Finish line:** every Exa search asks for page text; zero JSON across the 12 rebuilt cards at every stage; the invariant test green; person reads read about the right person, once; own-site pages labeled as the company; the four workarounds gone; the verifier comparison recorded; the 2-card judge check within the latency bound; a green `npm run check`; Samay's backfill decision recorded.

**Stop if:** a reader of `rawText` depends on JSON in a way that needs a schema change, or the extension's card schema rejects a field this task adds. Report back instead of widening scope.

---

### Task 2B: Pass publish dates through to the models (finding 7)

Samay chose an optional citation field plus a stored column. A date tells the judge whether a mechanism is live today, which the standard asks.

**Files:**
- Modify: `packages/core/src/card.ts` (`citationSchema`: optional `publishedAt`), `packages/db/src/schema.ts` and a new migration under `packages/db/drizzle/` (nullable `sources.published_at`), `packages/db/src/repositories/sources.ts`, `apps/web/src/inngest/source-fetching.ts` (`recordSourcesForCard`), `packages/pipeline/src/provider-facts.ts` (`providerSourcesFromStoredSources`), the citation builders in `provider-facts.ts`, `seed-profile.ts` and `generate-card.ts`, `packages/llm/src/how-it-wins-judge-rules.ts` (`sourceDate`)
- Test: each module's tests, plus `npm run test:cards-db` for the write path

- [ ] **Step 1.** Check whether the extension parses citations strictly. Find its card schema in `apps/extension/src` and its tests. If an unknown citation field would break an installed extension, stop and ask before going on, because that needs a contract version bump (`packages/core/api-contract.json`).
- [ ] **Step 2.** Failing tests: a source's `publishedAt` survives storage, the round trip back to `ProviderSource`, the citation builders, and the judge packet's `sourceDate`. A source with no date stays `null`, never a fetch time.
- [ ] **Step 3.** Implement. Generate the migration with the repo's Drizzle flow and apply it only to local Postgres. Extraction may pass dates in its evidence, but do not add a date field to the extraction model's citation schema; the date comes from the source, never from the model.
- [ ] **Step 4.** Run the tests, `npm run test:cards-db` and `npm run check`. Update `AGENTS.md` (the migration list in Data Layer) and `docs/code-map.md` in the same commit.
- [ ] **Step 5.** Commit: `Keep each source's publish date and show it to the judge`.
- [ ] **Step 6. Samay decides** when the migration runs in production. It runs only through `npm run db:migrate:production`, and before the deploy that needs it (Vercel deploys do not run migrations; see `docs/deployment.md`).

**Finish line:** a dated Exa source reaches the judge packet with its date; an undated one reaches it as `null`; migration applied locally; green check; production migration waiting on Samay.

---

### Task 2C: Remove the keyword filter on verified claims (finding 9)

- [ ] **Step 1.** Read `packages/pipeline/src/synthesis-quality.ts` and every caller of `applySynthesisUsefulnessGate`. Find out whether any test or eval relies on it.
- [ ] **Step 2.** Remove the gate, so verifier-approved claims are kept. Keep `usefulnessDroppedClaims` readable on old traces (optional field) but stop writing it, or delete it if nothing reads it. Remove the tests that only exist to test the gate. Keep any test that checks something else.
- [ ] **Step 3.** Run the tests and `npm run check`. Update any doc that names the gate (`rg -n 'usefulness' docs AGENTS.md`).
- [ ] **Step 4.** Commit: `Stop deleting verified claims by keyword`.

The prompt and the verifier carry quality. If generic claims come back, fix the synthesis prompt in Task 3, not with a filter.

**Finish line:** no regular expression runs over model-written claims; green check.

---

### Task 3: Stop pointing out what private companies never publish

**Files:**
- Modify: `packages/llm/src/expanded-description.ts:78`
- Modify: `packages/core/src/research-sections.ts:113-125` (the shared research-section rules)
- Modify: the synthesis and open-question prompt. Find it through `packages/llm/src/investor-taste-kernel.ts` and `docs/anthropic-llm-call-map.md`.
- Test: the existing prompt tests for each file

- [ ] **Step 1: Find the sources.** Read each prompt above and list every sentence that asks for, or invites, a statement about missing information. Include napkin-math "basis" instructions. Put the list in the task notes with file and line.
- [ ] **Step 2: Draft one principle for Samay.** Proposed wording, which Samay rewrites: "Private companies rarely publish revenue, margins, contract values or head-to-head results. Their absence is normal, not a finding. Mention a missing fact only when it is unusual for this company, or when finding it would change the read." Put it once, in the shared rules that these prompts already import. Remove the per-prompt sentences it replaces. The rule count must fall or stay flat.
- [ ] **Step 3: Samay decides** the wording, and whether the emphasis read's "Quiet" line stays, narrows to absences unusual for the category, or goes.
- [ ] **Step 4:** Apply the approved wording. Update any prompt-hash tests that change.
- [ ] **Step 5: Paid check, capped at $5.** Regenerate the research sections, synthesis and expanded description for the 12 companies with `scripts/repair-research-sections.ts` or `scripts/trace-generation.ts`. Use the rebuilt cards from Task 2 if they fit the script's input. Count absence lines with the Task 0 text match, as a monitor only.
- [ ] **Step 6: Review-focus check.** Find one company in the set that claims a figure with no source behind it. Confirm the new output still flags that gap.
- [ ] **Step 7: Samay reads** 4 of the 12 before and after, side by side, without labels saying which is which.
- [ ] **Step 8:** Commit: `State once that normal private-company absences are not findings`.

**Finish line:** Samay prefers the new reads, absence lines fall on the monitor, and the unusual gap in Step 6 is still flagged.

---

### Task 4: Let the judge accept the proof the rubric already allows

**Files:**
- Modify: `docs/superpowers/specs/2026-08-21-how-it-wins-strategy-rubric.md` (the Specialization row, line 40)
- Modify: `docs/superpowers/specs/2026-08-21-how-it-wins-judgment-standard.md` (the distinctiveness question and the compact-ruling sentence)
- Modify: `packages/llm/src/how-it-wins-judge-spec-text.ts` (the judge's frozen copy of both documents; find how it is regenerated before editing it by hand)
- Test: the judge rules and prompt-hash tests under `packages/llm/tests/`

- [ ] **Step 1: Draft three edits for Samay, each replacing words, not adding rules.**
  - Specialization's deciding question: from "Does the evidence show niche performance that broader rivals cannot match, not only that scope is narrow?" to one that names all three accepted proofs: a measured result, a capability broader rivals lack, or customers choosing it for that fit.
  - Distinctiveness: say that a capability rivals lack, or a customer's stated reason for choosing, counts as evidence of distinctiveness, so a head-to-head result is not required.
  - Missing evidence: reuse the screen's existing sentence, "Missing evidence is not evidence against" (`packages/llm/src/how-it-wins-screen.ts:54`), and add that head-to-head results and financials are rarely public for private companies.
- [ ] **Step 2: Samay decides** the wording. The standard is his.
- [ ] **Step 3:** Apply the approved wording to the documents and the frozen judge copy. Confirm the canonical strategy names and meanings are unchanged, because `how-it-wins-judge-rules.ts:62-68` throws if they differ.
- [ ] **Step 4:** Run the judge tests and `npm run check`.
- [ ] **Step 5:** Commit: `Accept the proof the rubric already allows and stop reading missing evidence as evidence against`.

Do not add a rule against the one-line shortcut. The structural fix is Task 5's scoped arm, where the Jev screen, not the judge, decides which strategies get a full ruling.

**Finish line:** approved wording is in both documents and the frozen copy, with a green check. Rulings are measured in Task 5, not here.

---

### Task 5: Rerun the judge comparison fairly, then choose

Runs after Tasks 2 through 4, so that both models see the fixed evidence, dates and rules. Audit finding 8 belongs here too: the judge's `context` repeats every snippet already in its evidence list. If Samay agrees, run the arms with the repeated snippets removed from `context`, and say so in the sheet.

**Files:**
- Output: `eval/curation/how-it-wins-batch/<timestamp>/` per run; a side-by-side sheet in `eval/curation/remediation-2026-09/`

- [ ] **Step 1: Samay decides** the budget. Estimate: 12 companies, 3 arms, 2 runs each, about 72 card runs at $0.45 to $0.70 each, about $35 to $50.
- [ ] **Step 2:** Run three arms on the 12 rebuilt cards, twice each, all under the same code (`tool_choice: auto`): A, Opus 5, full 80. B, Opus 5.5, full 80. C, Opus 5.5 with `HOW_IT_WINS_SCREEN=scoped`. Saved judgments are keyed by model (`795ad3c`), so each arm must be a fresh call. Confirm no run was served from the cache.
- [ ] **Step 3: Measure run-to-run agreement** within each arm: how often the two runs name the same current strategies. If an arm disagrees with itself as much as it disagrees with the other arms, record that model choice is not the main lever.
- [ ] **Step 4: Check the known cases** by reading them: DeepInfra low friction, Notion composability and completeness, Cognition and Neko Health specialization, Neko Health cloning, August malleability and precision. For each, record whether the ruling now engages the evidence, including the Task 2 page text.
- [ ] **Step 5:** Build a side-by-side sheet with the arms unlabeled, in the format of `eval/curation/how-it-wins-batch/2026-09-22-1734/writer-side-by-side.md`.
- [ ] **Step 6: Samay reads it blind** and chooses the judge model, and whether scoped mode goes on.
- [ ] **Step 7:** Apply his choice as environment changes only (`LLM_HOW_IT_WINS_JUDGE_MODEL`, `HOW_IT_WINS_SCREEN`). **Samay decides** the production deploy. After deploying, confirm with the first production run trace through the Inngest MCP, because the Vercel CLI returns blank values for sensitive settings.

**Finish line:** Samay has chosen, the choice is live, and one production trace confirms it.

---

### Task 6: Pilot one richer evidence source: buyers saying why they chose

Runs last, because it only pays off once the evidence text reaches the model (Task 2) and the rules accept this proof (Task 4). One source only, using providers we already pay for. No new vendor.

**Files:**
- Modify: `packages/providers/src/direct-exa.ts` (one new query family), `packages/providers/src/provider-budget.ts` (register its cost and stop conditions first, per AGENTS.md)
- Test: `packages/providers/tests/` for the query builder

- [ ] **Step 1:** Add one Exa query family that looks for customer-side statements: announcements by the customer naming the company ("selects", "chose", "switched from", "moved to"), and case studies with a named customer. Exclude the company's own domain from the customer-announcement query, so the source is independent.
- [ ] **Step 2:** Register the cost in `provider-budget.ts` before wiring it. Cap it at 1 to 2 searches per profile, about $0.007 each.
- [ ] **Step 3:** Tests for the query builder and the domain exclusion.
- [ ] **Step 4: Paid check, capped at $5.** Run the query for the 12 companies, rebuild their packets, and rerun the judge chosen in Task 5, once each.
- [ ] **Step 5:** Record new items found per company, how many are independent, and which rulings changed. **Samay reads** the changed rulings.
- [ ] **Step 6:** Commit only if Samay judges the changed rulings better. Otherwise, record the result and remove the query.

**Finish line:** a measured yes or no on whether this source improves reads, and the code kept or removed to match.

---

### Task 7: Record and close

- [ ] Update `docs/STATUS.md`: move this plan to Recently shipped with its commits, and list any open decisions under Next.
- [ ] Update the How it wins latency and cost notes if Task 5 changed the judge.
- [ ] Update `docs/qa/model-input-audit-2026-09.md` with what each finding became, and `docs/anthropic-llm-call-map.md` if a stage's inputs changed.
- [ ] Archive this plan to `docs/archive/plans/`.
- [ ] Append the session to `~/.progress.jsonl`.

---

## Richer evidence sources for later (not in this plan)

Ranked by what they prove and how reachable they are. Most need only a targeted Exa or Firecrawl query, not a new vendor.

| Source | What it proves | Reach |
| --- | --- | --- |
| Customer announcements and named case studies | Customers choosing on fit (Specialization, Completeness, Low-friction) | Exa query; Task 6 pilot |
| Public docs, API reference, pricing page, changelog | Drop-in APIs, recombinable parts, release pace, price position (Low-friction, Composability, Iteration, Affordability) | Firecrawl on the company's own site |
| Old snapshots of the pricing and home pages (Wayback Machine) | How positioning and price changed (Metamorphosis, Lure) | Free public archive |
| Job postings on public boards (Ashby, Greenhouse, Lever) | Where the company spends: its actual bet | Free public board APIs |
| Public benchmarks and usage rankings (OpenRouter rankings, SWE-bench, LMArena, Artificial Analysis) | Real head-to-head results, for AI companies only | Public pages |
| Public competitors' filings and earnings calls | Which private rivals incumbents name as threats | SEC EDGAR, already wired |
| Government records: FDA clearances, federal contracts, patents, clinical trials | Capabilities rivals lack, independently verified | Free public databases |
| Marketplace and integration listings (AWS Marketplace, Salesforce AppExchange, Zapier) | Partnerships and ecosystems (Alliance, Aggregation, Composability) | Public pages |
| Hacker News, Reddit, X and GitHub issues | Switching stories and complaints from users | HN, X and GitHub lanes exist for founder voice; widen them to customers |
| Founder podcasts and conference talks | The founder's own account of the bet | Transcripts via search |
| Review sites (G2, Capterra) | "Compared to" and switching reasons | Scraping terms are a risk |
| Tegus, AlphaSense, Sacra, Similarweb | Expert calls, analyst estimates, traffic | Paid and license-limited; Sacra's free summaries already appear in some evidence |

## Out of scope

- The Paul Graham "powers" layer (`docs/superpowers/specs/2026-09-16-how-it-wins-framework-mapping-paul-graham-powers.md`). Revisit after Task 5.
- New UI and contract-version changes. The one new card field is the optional citation `publishedAt` in Task 2B.
- Any per-strategy rule, output regex, or model-specific prompt branch.

## Session prompt

Paste this into a fresh session to run the plan from Task 2. (The first session prompt ran Tasks 0 and 1.)

```text
Execute the evidence and judgment remediation plan in Cold Start, from Task 2 onward: docs/superpowers/plans/2026-09-23-evidence-and-judgment-remediation.md.

Where things stand: Tasks 0 and 1 are done (commits 057bde4 and 030948c on local main, not pushed). The audit is docs/qa/model-input-audit-2026-09.md. On September 23 I approved every finding in it. The plan now carries them as Task 2 (five parts, A to E), Task 2B (publish dates) and Task 2C (remove the keyword filter). The ledger at .superpowers/sdd/2026-09-23-evidence-and-judgment-remediation/progress.md holds every ruling so far. Resume from it.

Read these in full before you touch code: the plan, the audit, AGENTS.md and the ledger. Use superpowers:executing-plans with that ledger, superpowers:test-driven-development for every code change, superpowers:systematic-debugging whenever something behaves unexpectedly, and superpowers:verification-before-completion before you call any step done.

Why this matters: the audit showed that our reads are limited by what reaches the models, not by which model we pick. 37% of stored sources hold only a title, because eight paid searches never ask for page text. Most of the rest reach the models as cut-off JSON. Person reads describe the wrong person. The evidence leans toward funding news. This is the largest quality gain available in the product right now.

How to work:
1. Trust the models. Fix inputs before instructions. Add no prompt rules. No patch aimed at one company, one strategy or one model, and no regex on model output. Task 2C removes the one that exists.
2. Read the real thing. Before you claim what a model sees or does, open the payload (npm run qa:model-inputs -- --slug <slug>), the trace or the database row, and read it in full. Count reach on the 373-card corpus or with read-only production queries. Label every finding verified or likely.
3. Fix at the source and pin the invariant with a test: no text a model reads as evidence is JSON. Use one readable-text function and one snippet builder everywhere, then delete the four workarounds. Old stored rows stay JSON, so every reader must handle both forms.
4. Hygiene. Small commits, one reason each, in the repo's plain style. Watch each new test fail before you make it pass. Run npm run check after every commit, write its output to a file and read all of it. Never pipe it through tail. It fails today only at knip, on my untracked apps/web/src/app/proto/ folder. Leave that folder alone and treat any other failure as yours. Start Postgres with npm run db:local first. Run package tests with npm run test -w <package> -- <file>, never npx vitest run -w. Keep files under 1,000 lines. Update AGENTS.md, docs/code-map.md, docs/commands.md and docs/STATUS.md in the same commit as the change that makes them wrong.
5. The tree is shared. Other work is staged or untracked on main: apps/video/share, two product docs, apps/web/src/app/proto and a Paul Graham spec. Never commit, stash, check out or clean it. Commit with explicit paths (git commit -m "..." -- <paths>) and check git status before each commit.
6. Money. Keep each paid run inside its cap (Task 2 E2 $3, E4 $3, E5 $2, Task 3 $5, Task 6 $5) and report the actual spend. Ask me before anything over $10, which includes Task 5.
7. Stop and wait for me at: prompt or rubric wording (Tasks 3 and 4), the emphasis read's Quiet line, the judge model and scoped mode (Task 5), the production backfill (Task 2 E7), the production dates migration (Task 2B), and every production write, deploy or environment change. Production reads for measurement are fine. The search query rewording in Task 2 A4 is not a gate, but show me the before and after.
8. Stop and report if a change needs a schema change the plan does not name, a contract version bump, or anything that could break installed extensions.

Delegation: you may use read-only subagents on Sonnet 5 for broad searches or payload reading. Give each one clear question and ask for file, line and counts. Verify what they report before you act on it. Write all code yourself. After Task 2C and before Task 3, run a whole-branch review with a fresh reviewer on the most capable model (superpowers:requesting-code-review), giving it the plan's Review focus section. Fix each Critical or Important finding with a failing test first.

Order: Task 2 parts A to E, then 2B, then 2C, then the review, then Tasks 3 to 7. Stop at each gate.

Reporting: at each stop, tell me in plain English, in short sentences with no jargon, what changed, what you checked and how, what it cost and what is still open. When something needs my eyes, such as the query rewording, the verifier comparison, or the Task 3 and Task 5 reads, give me the actual text side by side, not a summary of it. When Task 7 closes the plan, append the session to ~/.progress.jsonl.
```
