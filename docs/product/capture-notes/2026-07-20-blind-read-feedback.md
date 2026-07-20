# Blind-read feedback capture (running, round by round)

Samay's inline feedback from the blind side-by-side review of judgment-stage outputs (run `2026-07-20T12-59-38-007Z`), captured via Marginalia. Model identities stay sealed until all rounds finish; everything below is model-agnostic product feedback. Protocol note: in these bundles, deletions and insertions are annotation anchors only, never writing edits.

## Round 1: bendingspoons / synthesis (2026-07-20, bundle 21-27-14)

Verdict: Output C best of the four. Its opening was the strongest read, and one of its claims (investor quality implying healthy long-term dynamics) earned trust from a reader explicitly biased against that argument shape: "typically I'm biased against reflexive arguments that investors good == healthy long term dynamics but I think its genuinely a good insight here." That is the quality bar: non-reflexive claims that survive a skeptical investor's priors.

### Conceptual gaps (product-level, model-agnostic)

1. **Open-question monotony.** Nearly every profile leads with the net-revenue-retention question. Every investor already knows to ask it; as the perpetual first question it reads as template output and gets tiring. The generator needs diversity pressure and a ban on leading with the generic-metrics question class unless the evidence makes it unusually pointed.

2. **Evidence-availability blindness.** The NRR question is only "open" because we lack financials, but Bending Spoons has public filings, so the evidence to answer it exists and the question does not even apply. An open question must clear a check: is this answerable from evidence we have or could trivially fetch? If yes, answer it or drop it. This is the deeper defect; the monotony is its symptom.

3. **Unjustified question priority.** "Why are these the three most important questions?" The synthesis should be able to defend why its three open questions beat the alternatives for THIS company. Today the selection carries no visible priority logic.

4. **Slop diction in synthesis claims.** Flagged verbatim: "one-time asset stripping story... pricing in a durable compounding model" and "the mechanism has portfolio-level proof." Language that pattern-matches to AI analysis-speak destroys trust even when the underlying point is right. The investor-taste-kernel needs harder anti-slop constraints on synthesis phrasing.

5. **Unsupported inferential leaps.** "The 40% first-day IPO pop signals X": the fact may be cited, but the inference is not defended (do IPO pops always signal that?). The verifier checks citation support for facts; it does not test whether inferences drawn FROM cited facts are warranted. That is a verification blind spot.

6. **Assumed context.** "The permanent-hold model with centralized tech-stack overhaul" presumes the reader already knows Bending Spoons' model. Claims should be self-contained for a reader with no prior context on the company.

### Fix directions to evaluate after all rounds

- Synthesis/openQuestions prompt: evidence-answerability check, generic-question ban list, per-question "why this matters here" justification, self-containment rule.
- Verifier scope: extend from fact-support to inference-warrant on claims that draw conclusions from cited facts.
- Investor-taste-kernel: strengthen anti-slop diction constraints; the eval scorer's generic-phrase list should grow from flagged phrases in these rounds.
- Eval: add flagged-phrase and template-question detectors to `eval/investor-lens/score.mjs` so regressions get caught mechanically.

## Process notes

- Review format works: rationale-anchored notes on specific lines, plus a per-group verdict. Rounds of 4 groups per sitting, anchors pre-inserted as deletable lines (adopted from round 2 onward).
- Marginalia use-case improvement ideas filed in that project's `docs/NEXT-STEPS.md` (comment-without-delete, section-aware sessions).

## Round 2: bendingspoons / research_section / customer_proof (2026-07-20, bundle 21-38-58)

Verdict: none of the four impressed. Top two: Output A ("okay, straightforward but very report-the-truth, nothing super interesting"; "sparse in a good way because I didn't think there was much value to add here that merited this many words") and Output C ("like the writing style, matter of fact and correct and just makes sense"). Output D disliked; Output B "fine to less than fine".

### Conceptual gaps added

7. **Metric-granularity inconsistency.** "Why would the product names be included in aggregate MAUs but not aggregate paying customers": when a section reports one metric with per-product breakdown and the adjacent metric only in aggregate, the inconsistency reads as sloppy or evasive. Customer-proof sections should hold granularity constant across metrics, or say why they cannot.

8. **Length must earn itself.** On thin evidence, honest sparsity beat padded completeness: the reader explicitly rewarded the output that said less because there was less to say. This is the kernel's "prefer fewer strong points over complete-looking filler" rule showing up as a real preference; outputs that padded lost trust. Length discipline is a quality feature, not a formatting choice.

9. **Matter-of-fact register wins sections.** The style praise went to plain, correct, no-flourish writing. Research sections are evidence surfaces, not essays; the lens voice should be flattest here.

Reveal (user-requested, post-verdict): Round 2's top two were A = deepseek-v4-pro, C = deepseek-v4-flash. Round 1's Output C (best of group) = deepseek-v4-flash.

## Remaining rounds: pending, one category per sitting

Reviewed so far: bendingspoons synthesis, bendingspoons customer_proof. Next up: bendingspoons financing, then dice synthesis, dice customer_proof, dice financing, and onward through the 33 groups. Cadence changed at user request: each Marginalia draft carries exactly one group.
