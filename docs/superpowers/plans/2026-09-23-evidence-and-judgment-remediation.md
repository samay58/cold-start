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
4. **Opus 5 filled gaps from memory.** It marked Notion's composability as current by citing block primitives. The word "block" appears nowhere in Notion's 32 evidence items. That breaks the "supplied evidence only" rule. Opus 5.5 caught it.
5. **Opus 5.5 skips work.** The standard lets the judge write a one-line ruling when a strategy "fails the evidence gate", and the judge decides that for itself. Opus 5.5 did so for 50 to 58 of 80 strategies per company, against 13 to 36 for Opus 5. On DeepInfra's low friction it wrote "no behaviour change or edge over peers is shown" while the packet held revenue tripling, 25x token growth and 30% of volume from agents.
6. **Our rules keep asking for head-to-head proof.** The Specialization row demands a fit "that broader rivals demonstrably lack". The distinctiveness test calls a trait category baseline "if two comparable companies share the trait". The rubric already accepts three kinds of proof: "a measured result, a capability they do not have, or customers choosing on that fit". Opus 5.5 reads it as head-to-head results only.
7. **Profiles keep stating what private companies never publish.** A narrow text match finds such lines in at least 130 of 373 corpus profiles (`eval/curation/corpus/cards`). The real rate is higher, because the match misses many phrasings. The main sources are research-section items (101 hits), expanded-description paragraphs (56), research-section summaries (31), napkin-math bases and bear-case claims. The prompts behind this include `packages/llm/src/expanded-description.ts:78` and the research-section rules in `packages/core/src/research-sections.ts:113-125`. The emphasis read's "Quiet" line is an absence list by design (`packages/llm/src/emphasis-read.ts:44`).
8. **The comparison itself was not controlled.** The Opus 5 verdicts came from about 3:45 PM on September 22, under a forced tool choice. The Opus 5.5 run came after `4830c3c` (10:02 PM), which moved every stage to `tool_choice: auto`. Each model ran once. Neither accepts a temperature setting, so run-to-run variation is unmeasured.

## Decisions reserved for Samay

- The exact wording of every prompt or rubric sentence changed in Tasks 2 and 3. The judgment standard is his.
- Whether the emphasis read keeps its "Quiet" line (Task 3).
- Which judge model to keep, after his blind reading (Task 5).
- Whether to turn on `HOW_IT_WINS_SCREEN=scoped` (Task 5).
- Any paid run over $10, and every production deploy.

## Review focus

The failure modes most likely to bite, each pinned to a task:

1. A search result with no `text`, `summary` or `highlights` falls back to a title, not to JSON. (Task 2 test.)
2. Page text that is boilerplate, such as cookie banners or nav menus, displaces real content. (Task 2 check on 12 packets.)
3. Longer evidence pushes the judge past its timeout or its budget. The judge prompt is already about 19k input tokens. (Task 2 check: record judge input tokens and latency before and after.)
4. New evidence text changes the evidence-packet hash, so memoized judgments (`how_it_wins_judgments`) miss and re-files pay again. This is expected once; confirm it settles. (Task 2 note in the commit and STATUS.)
5. The "do not state normal absences" principle hides a gap that matters, such as a company claiming revenue with no source. (Task 3 check on one known case.)
6. Existing production profiles keep their empty snippets after the fix ships, so testers see no change on companies already built. (Task 2, Step 14 backfill decision.)

---

### Task 0: Fix the comparison set and freeze a baseline

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

### Task 1: Audit what every model actually sees and keeps

Read-only. The empty-snippet bug lived for months because nobody read a real model input end to end. This task does that for every stage and looks for the same kind of silent quality loss elsewhere: problems that never crash, never fail a test, and quietly make the reads worse.

**Files:**
- Create: `scripts/dump-model-inputs.ts` (read-only; prints the exact payload each stage would send for one card)
- Create: `docs/qa/model-input-audit-2026-09.md` (findings)

- [ ] **Step 1: Build the dump.** For one card, print the exact evidence each stage would receive, using the production builders rather than copies of them: extraction (`evidenceForExtractionPrompt`), synthesis, the verifier's `citationSources`, the emphasis digests (`emphasisSourceDigests`), research sections, the person read, the expanded description, the Jev screen and the How it wins judge (`howItWinsEvidencePacketFromCard`). Use `docs/anthropic-llm-call-map.md` to make sure no stage is missed. No model calls.
- [ ] **Step 2: Read the payloads in full** for 3 of the 12 companies: Notion, DeepInfra and the thin file. For each stage, record what is missing, empty, cut mid-sentence, duplicated, mislabeled, undated, or skewed toward one kind of fact.
- [ ] **Step 3: Check the outputs too.** Find where good model output is silently thrown away. Look at the verifier's drops, the `trust.ts` caps, schema validators that drop instead of failing, and `catch` blocks that fall back to a default without a trace. Measure the verifier first. From production `generation_runs` traces (read-only), count dropped claims, and how many of them cited a citation whose snippet is empty.
- [ ] **Step 4: Sweep for the same patterns in code**, and read each hit rather than trusting the grep:
  - JSON used as text: `rg -n 'JSON\.stringify' packages apps -g '*.ts' -g '!**/tests/**'`, keeping hits that feed a prompt, a snippet or `rawText`.
  - Hard cuts: `rg -n '\.slice\(0, *[0-9_]+\)' packages apps -g '*.ts' -g '!**/tests/**'`, keeping hits on model-bound text.
  - Fields set to a constant null or empty value in builders (`sourceDate: null` is one).
  - Downstream workarounds that suggest an upstream bug, such as comments saying "most X are Y" or "raw provider".
  - Silent fallbacks: `catch` blocks and `?? ""` or `|| title` on model-bound text.
  - Configuration drift: production flags that differ from code defaults, read from a current production run trace, because the Vercel CLI hides sensitive values.
- [ ] **Step 5: Measure each finding's reach** on the 373-card corpus or production traces, the way finding 1 above was measured. A finding without a count is a guess.
- [ ] **Step 6: Write `docs/qa/model-input-audit-2026-09.md`**: each finding with its cause (file and line), its reach, its effect on reads, and a proposed fix. Rank by effect on what a reader sees. Mark each as verified or likely.
- [ ] **Step 7: Samay decides** which findings join this plan. Add each approved fix to Task 2 when it concerns evidence plumbing, or as a new task after Task 2 otherwise, in the same format as the other tasks.
- [ ] **Step 8:** Commit the dump script and the audit: `Audit the evidence every model stage receives`.

Read-only subagents may fan out Steps 2 to 4, one per stage or pattern. Each one reports findings with file and line; the lead verifies each finding before it goes in the audit.

**Finish line:** an audit document with every model stage covered, every finding counted, and Samay's decision on which to fix.

---

### Task 2: Give every model the page text

The biggest single gain. It is a bug, not a judgment call, and it reaches every model stage that judges. Fold in any evidence-plumbing findings Samay approved from Task 1.

**Files:**
- Modify: `packages/providers/src/direct-exa.ts:384` and `:369`, and the `JSON.stringify` rawText sites in `packages/providers/src/stableenrich/` if Task 1 shows they feed snippets
- Modify: the snippet builders: `packages/pipeline/src/provider-facts.ts:213`, `apps/web/src/inngest/source-fetching.ts:102`, `packages/pipeline/src/seed-profile.ts:140` and `:263`
- Modify: `packages/llm/src/how-it-wins-judge-rules.ts:89-94` (source dates)
- Modify: `apps/extension/src/company/clipping-model.ts:91` (remove the JSON workaround once snippets are clean)
- Test: the existing test files for each module under their package's `tests/` folder

- [ ] **Step 1: Find every reader of `rawText` before changing it.** Run `rg -n 'rawText|raw_text' packages apps -g '*.ts' -g '!**/tests/**'`. Some readers may parse the JSON, for example `source-gate.ts:147`, the fact extractors, and the Postgres `sources.raw_text` column. Write the list into the task notes.
- [ ] **Step 2: Choose the narrowest safe fix.** If any reader parses `rawText` as JSON, leave `rawText` alone and fix the snippet builders instead: build the snippet from `rawRecordText`-style readable text (`text`, then `summary`, then `highlights`, then title). If nothing parses it, change `direct-exa.ts:384` to store readable text and keep the metadata in fields that already exist (`title`, `url`, `publishedAt`). Record the choice and reason in the commit message.
- [ ] **Step 3: Write the failing tests.** (a) An Exa record with `text` produces a snippet that starts with page text, not `{`. (b) A record with only `highlights` uses the highlights. (c) A record with none of the three produces the title, never JSON. (d) One invariant test, over a card fixture built through the real pipeline helpers: no citation snippet, and no evidence text in the judge packet, the verifier's sources or the emphasis digests, parses as JSON.
- [ ] **Step 4:** Run `npm run test -w <package> -- <file>` for each package touched and confirm the new tests fail. Do not use `npx vitest run -w`; it starts watch mode and never exits.
- [ ] **Step 5: Implement.** Write one shared snippet builder and use it at every builder site listed above. Snippet length: replace the 280- and 700-character cuts with one shared constant of about 600 characters, cut at a sentence boundary with `packages/core/src/sentences.ts`. Do not write a new splitter. If Task 1 confirmed the funding-word bias in `evidence-ledger.ts:113-133`, choose the snippet by relevance to the source, not by funding keywords, and keep the funding preference only where funding extraction needs it.
- [ ] **Step 6: Pass source dates.** In `how-it-wins-judge-rules.ts`, set `sourceDate` from the citation's published date when the card has one. Add a test.
- [ ] **Step 7:** Run the tests and confirm they pass. Then run `npm run check` from the repo root and read the full output. Do not pipe it through `tail`, which hides the exit code.
- [ ] **Step 8: Rebuild the 12 evidence packets without paying for new searches.** The frozen corpus cards carry the old snippets. Write a read-only script in `scripts/` that rebuilds each card's citation snippets from production `sources.raw_text` using the new builder. It loads `.env.production.migrate.local`, the way `qa-generation-suite.ts` does. Save the rebuilt cards under `eval/curation/remediation-2026-09/cards/`. Do not write to the database.
- [ ] **Step 9: Check the packets by eye.** For 3 of the 12, read every evidence item. Confirm that item text is page content, that no item is boilerplate, and that the Notion items now contain the text of the notion.so homepage and the developer-platform post. Record JSON stubs (target 0) and median item length.
- [ ] **Step 10: One paid check, capped at $3.** Run the judge once, on the current production model (Opus 5), for 2 of the rebuilt cards with `scripts/how-it-wins-batch.ts`. Record judge input tokens, latency and cost against the baseline. Stop and report if latency rises more than 30% or any call times out.
- [ ] **Step 11: Measure the verifier.** Rerun only the verifier (Sonnet 4.6, cheap) on the 12 rebuilt cards' existing synthesis, capped at $2. Compare drops before and after. If true claims were being dropped for lack of a readable source, this is where it shows.
- [ ] **Step 12: Remove the workaround.** Delete the JSON gate in `clipping-model.ts` and update its tests, so the extension shows the real snippet.
- [ ] **Step 13:** Commit in small pieces: the builder and its tests; the call-site changes; source dates; the workaround removal. The first message states that memoized judgments will miss once, because the evidence hash changes.
- [ ] **Step 14: Samay decides** whether to backfill existing production profiles. New profiles get clean snippets after deploy. The roughly 400 existing ones keep empty snippets until they are re-filed or backfilled. A backfill would rebuild snippets from `sources.raw_text` with the same builder. It is a production write, so it needs approval, a dry run that prints the counts it would change, and a readback afterward.

**Finish line:** zero JSON snippets across the 12 rebuilt cards at every stage, the invariant test green, the verifier comparison recorded, the extension workaround gone, a green `npm run check`, the 2-card paid check within the latency bound, and Samay's backfill decision recorded.

**Stop if:** a reader of `rawText` depends on JSON in a way that needs a schema or migration change. Report back instead of widening scope.

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

Runs after Tasks 1 and 3, so that both models see the fixed evidence and the fixed rules.

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
- New UI, new card fields, and contract-version changes.
- Any per-strategy rule, output regex, or model-specific prompt branch.

## Session prompt

Paste this into a fresh session to run the plan.

```text
Execute the evidence and judgment remediation plan in Cold Start: docs/superpowers/plans/2026-09-23-evidence-and-judgment-remediation.md.

Read the whole plan first, then AGENTS.md. Use superpowers:executing-plans, superpowers:systematic-debugging for anything that behaves unexpectedly, and superpowers:verification-before-completion before you call any task done.

Why this matters: yesterday we learned that 30% of the citation snippets our models read are search metadata with no page text. The bug reached every model stage that judges, and it lived for months because nobody read a real model input end to end. The quality of our reads depends more on what evidence reaches the model, and on whether our rules ask for proof private companies never publish, than on which model we pick.

How to work:
1. Trust the models. Fix inputs before instructions. Never add a rule where better evidence would do. No prompt gets more rules than it has now. No patch aimed at one company, one strategy or one model, and no regex on model output.
2. Read the real thing. Before you claim anything about what a model sees or does, open the actual payload, trace or record and read it in full. Count reach on the corpus or production traces. Label every finding verified or likely.
3. Fix at the source, pin the invariant with a test, and delete the workarounds the bug made necessary.
4. Keep the hygiene rules in the plan: one helper per job, small commits with one reason each, npm run check green after every commit with its full output read, files under 1,000 lines, docs updated in the same commit as the change that makes them wrong, and git status checked for other sessions' work before each commit.
5. Stop at every "Samay decides" gate and wait. That covers every prompt and rubric wording change, the emphasis read's Quiet line, the judge model, scoped mode, any paid run over $10, the production backfill, and every production write, deploy or environment change. Production reads for measurement are fine.
6. Keep every paid run inside its stated cap and report the actual spend.

Order: Task 0, then Task 1, the audit. Bring me the audit's ranked findings before you fix anything, so I can choose what joins the plan. Then work through Task 2 onward, one task at a time.

For the Task 1 fan-out you may use read-only subagents on Sonnet 5 at medium effort, one per model stage or code pattern. Each reports findings with file, line and a count. Verify every finding yourself before it goes in the audit.

Report to me in plain English, short sentences, no jargon. At each stopping point, tell me what changed, what you checked and what is still open. When something needs my eyes, give me the side-by-side to read, not a summary of it.
```
