# Sitting 2 notes, enriched: the How it wins blind read (closed 2026-08-21, 10 of 10)

Samay's dictated notes from the how-it-wins ledger, wording verbatim including dictation typos. Added here: which writer was which arm (revealed to him after each verdict), what part of the read each fragment is about, tags, and the findings that already change the build. Cards 1-7 on 2026-08-20; cards 8-10 on 2026-08-21. The sitting is closed. The second ten of the original twenty stay unread as the holdout for the revised pipeline. Do not reopen `/eval/how-it-wins` until that pipeline exists; the route will serve the holdout next.

Tag vocabulary: anchoring, breadth, hedge-in-sentence, prompt-induced-slop, missing-center, label-choice, meaning-lines, confidence, sentence-craft, evidence, wordy.

Writers in this sitting: Sonnet 4.6 and Sonnet 5. Editor for every arm: DeepSeek v4-pro. Same frozen evidence per card.

## Card 1: Suki. Pick B. A slop (Sonnet 4.6), B weak (Sonnet 5)

> "Don't say AI slop shit like "the read would weaken". B was good but I feel like it could be better. But it was pretty good I guess we will say "ship" I really don't know. I think weak is probably better for this one."

- **A (Sonnet 4.6)**, the final wrong-if: "This read would weaken if…" is the model talking about its own read instead of the world. Banned phrasing. Cause is the prompt: the wrong_if slot asks "what would make the read wrong," so the model answers about the read. [prompt-induced-slop]
- **A**, the sentence: three clauses and a built-in hedge ("what is not known is whether either slot is exclusive"). Slop verdict lands mostly on the sentence. [hedge-in-sentence] [sentence-craft]
- **B (Sonnet 5)**: good, not great; he moved from Ship to Weak while dictating. B centered on the athenahealth-versus-competing-EHRs paradox and ran only two strategies, no pair. [anchoring]
- Same facts, same citation ids, different labels across the two arms: Alliance against Symbiosis, Usership against Reliability. [label-choice]

## Card 2: Neko Health. Pick B. A slop (Sonnet 5), B ship (Sonnet 4.6)

> "I like B's first part of the sentence, but I like A's remainder - this part "while Prenuvo and Ezra charge more than $1,000 for MRI-based screening, and Neko can set that price only if its own multi-sensor scanner costs substantially less per scan than the MRI machines its rivals lease or buy.""

- The sentence he wants is a splice: B's fact (GBP 299, 70+ non-MRI sensors) plus A's mechanism (the price only holds if the scanner's per-scan cost beats leased MRI). The sentence slot should carry fact plus mechanism; each writer carried one half. [sentence-craft]

> "Don't say AI slop like "is observed fact", these are unecessary words. Again, /say-less plain english please."

- Banned phrasing. Cause is the prompt: the writing standard asks each note to state "observed or inferred, once, at the end, in ordinary words," and the models render it as a tag. Certainty should live in the verb ("the evidence does not show"), never as a closing label. [prompt-induced-slop]

> "I do think COMPLETENESS makes sense for this one as well though."

- Label judgment from him: Completeness belongs in Neko's running list. A (Sonnet 5) had it; B (Sonnet 4.6), the read he shipped, ran Affordability, Specialization, Hybrid. [label-choice]

> "We should have the short explanation of each category (e.g. "A company wins on price only when its delivery cost is reliably lower than competitors' delivery cost, not when it temporarily charges less." under Affordability) -- we should have that for all categories. They're missing for Monopoly, and Antifragililyy and Symbiosis."

- Product ask. The schema gives "next" entries no meaning line, which is why Monopoly, Antifragility, and Symbiosis (all in "next" slots here) were bare. Core already holds one canonical meaning sentence for all 80 strategies, never shown; the model writes its own meaning per running entry. Render the canonical line for every strategy, everywhere; stop asking the model to write one. [meaning-lines]

> "But overall the right side (B's) is MUCH sharper."

- **B (Sonnet 4.6)**: sharper. His only Ship so far went here. [sentence-craft]

## Card 3: DeepInfra. Pick A. A ship (Sonnet 4.6), B weak (Sonnet 5)

> "To start with - the intro part of "A" is much more nuanced and CORRECt, IMO."

- **A (Sonnet 4.6)**, the sentence: owned GPUs across eight US data centers, 30% of five trillion weekly tokens from agents that need consistent latency. Correct and nuanced, in his read. [sentence-craft] [evidence]

> "Efficiency is a great claim."

- Label endorsed: Efficiency, which both arms ran. [label-choice]

> "This gave me a thought - maybe we should put like a rough Low Medium High confidence tag (without making it look like AI slop - making it look high craft etc. - and without attributing a specific %age probability to it. Lets file away to talk about this later."

- Product idea, filed. It maps onto the three-draw judge vote in the spec's queue: 3 of 3 draws agreeing is high, 2 of 3 is medium; no percentage, no model-stated confidence. [confidence]

> "The intelligence of A seems to be mcuh better. Although I did like the aggregation point discussed in "B". That's a good one."

- **A (Sonnet 4.6)** judged more intelligent overall. **B (Sonnet 5)** centered on NVIDIA-as-investor plus Blackwell timing and ran four strategies (Efficiency, Versatility, First mover, Security); its Aggregation "next" entry was the one thing he kept. [anchoring] [breadth]

## Card 4: Cognition. Pick A. A weak (Sonnet 4.6), B slop (Sonnet 5)

> "I think we're fundamentally missing a critical piece of analysis for Cognition actually - they're pursuing a unique strategy with cloud-first always running agents as well. But first mover is also definitely valid. I just think we're not seeing the full nuanced picture actually for Cognition which genuinely worries me (this is why I worry about applying model judgement, but maybe we can get smarter about it)."

- Both arms missed the company's actual bet. Checked against the frozen evidence: Cognition's card says "cloud agent" nine times, including "autonomous cloud coding agents (Devin)" and "Devin operates as a cloud agent with VM isolation, session persistence." The evidence was there. This is a judgment miss, not a sourcing gap, and it is the strongest single argument for a judge pass with a written standard ("what is this company's actual bet?"). [missing-center] [evidence]

> "B is just straiht up not good. It over focuses too much on one piece (the Windsurf acquisition), which is just one Chapter in Cognitions business story."

- **B (Sonnet 5)**: the whole read built on Windsurf (Hybrid, Scavenging, Prestige). "One chapter." [anchoring]

## Card 5: Notion. Pick A. A ship (Sonnet 4.6), B weak (Sonnet 5)

> "The first paragraph - A is WAY better than B so far. What A is missing is a short discussion about Custom agents, like literally a few words. But its making the right points, judgement and writing are both better."

- **A (Sonnet 4.6)**, the sentence: AI-paying customers are over half of recurring revenue, and the link from workspace content to AI usefulness is unshown. Judgment and writing both better, in his read. Gap: the Custom Agents launch, a few words. **B (Sonnet 5)** built its sentence on competitor roundups plus the Custom Agents timeline and said the two facts share no cause. [sentence-craft] [anchoring]

> "Completeness, Composability, Usership are all fantastic insights for this one. Definitely A over B I think."

- Labels endorsed: A's running three. [label-choice]

> "Not sure I agree with Prestige or Aggregation, but TBD on those. Oh you mean vs. Microsoft 365, yes"

- A's "next" entries, doubted then accepted once the note named Microsoft 365. The meaning line would have made this instant. [label-choice] [meaning-lines]

## Card 6: Doppel. Pick B. A slop (Sonnet 5), B weak (Sonnet 4.6)

> "I really don't like when you refer to "on the card confirms" like stop saying on the card man. Its unecessary and not professional the way we want."

- Banned phrasing, third of the sitting. Prompt-induced again: the task hands the model "The company's card (facts, signals, citations with source snippets)," so the model writes about "the card." The prompt should call it the evidence, or nothing, and the read should never name its own input. [prompt-induced-slop]

> "B first paragraph is written WAY BETTER. Even if the insights are similar."

- **B (Sonnet 4.6)**, the sentence: four expansions in a year, a threat graph across six channels, breadth unmeasured against narrower competitors. Same insight as A, better written. [sentence-craft]

> "I don't get how Iteration works here though, the evidence for Iteration is super weak. Its just saying the company raised a lot and launched things? I really don't get it? But maybe I'm just misunderstanding."

- Both arms ran Iteration. Raising money and shipping features is not a fast feedback loop. A judgment-standard rule candidate: Iteration needs evidence of learning between releases, not release count. [label-choice] [evidence]

> "Violence is interesting, Antifragility is...okay?!"

- A's pair (Violence, Antifragility): one label earned interest, the other did not convince. [label-choice]

> "Overall B is much better than A, but I think this is one of the weaker pairs vs. others. But B is good just not great."

- Card-level: weaker pair overall. [evidence]

## Card 7: Profluent. Pick B. A weak (Sonnet 5), B weak (Sonnet 4.6)

> "I think the judgement and analysis for B, at least in the selections it made, are better. Specialization and Lure are both interesting and probably good."

- **B (Sonnet 4.6)**: Secrecy, Specialization, Lure; the Lilly deal as the centre. Judgment endorsed on the selections. [label-choice]

> "Prestige is weak, although its true it works for literally every company that raises from "top tier" VC's. Which is going to be a big chunk lol."

- **A (Sonnet 5)** ran Prestige. Second sighting of Prestige as a lazy label (Notion's "next" was the first). Judgment-standard rule candidate: a top-tier cap table is not Prestige; Prestige needs the brand to change a buyer's decision. [label-choice]

> "But I think I like A's writing slightly better? So maybe B's insights, but honestly I like B's depth of analysis, its just INCREDIBLY wordy which is fine but not IDEAL I guess?"

- First card where Sonnet 5's prose wins and Sonnet 4.6's judgment wins. Sonnet 4.6 wordy. Both Weak. This is the split in one card: the judgment he wants from one arm, the sentences from the other. [wordy] [sentence-craft]

## Card 8: Bland. Pick neither. A weak (Sonnet 4.6), B weak (Sonnet 5)

> "B's intro is much better.
>
> But the insights are better for A. Although is Specialization really applicable here? But definitely better than "Secrecy".  But I guess secrecy applies, not really though.
>
> Reliability and Security are probably legit"

- **Neither.** Second split card after Profluent: Sonnet 5 wins the sentence, Sonnet 4.6 wins the labels, neither is good enough to pick. [sentence-craft] [label-choice]
- **B (Sonnet 5)**, the sentence: proprietary in-house voice models, 30-to-45-minute calls, a blood-pressure-to-ER example. Sharper scene. [anchoring] [sentence-craft]
- **A (Sonnet 4.6)** ran Specialization, Secrecy, Reliability. Specialization doubted, better than Secrecy, Secrecy "not really." Reliability kept. **B** ran Secrecy, Specialization, Security, Completeness; Security kept. The labels he wants are split across arms. [label-choice]
- Both arms paired Specialization with Secrecy. He did not buy that pair. [label-choice]

## Card 9: Hebbia. Pick A. A ship (Sonnet 4.6), B weak (Sonnet 5)

> "A's intro is better. Like better insights and written clearer.
>
> Specialization is a decent one here, as well as completeness. So A wins on those"

- **A (Sonnet 4.6)**, the sentence: more than 40% of the largest asset managers by AUM, ICE and Intralinks into the same Matrix workflow, lock-in unshown. Fourth Ship, all on 4.6. [sentence-craft] [evidence]
- Labels endorsed: A's running Specialization and Completeness. A also ran Symbiosis; B ran Specialization, Alliance, Prestige. Prestige again from Sonnet 5, third sighting (Notion next, Profluent running, Hebbia running). [label-choice]

## Card 10: August. Pick B. A slop (Sonnet 5), B weak (Sonnet 4.6)

> "I'm not sure what the "Running" tag means. Again, that's AI slop. Its not clear at all.
>
> B is better written. We can't start this section with the customer name lol.
>
> B is definitely better I would say. The intro I mean.
>
> B is too long but I think the insights and judgement are better vs. A. But its too long."

- **"Running" is a leaked schema name.** The rig heading is the internal slot, not a reader word. Same family as "on the card": the instrument naming itself. Rename the heading (the live bet, what currently wins) and never show the slot id. [prompt-induced-slop]
- **A (Sonnet 5)** opened on Hicksons, ELP, and a Florida team. Customer names as the lede. Banned pattern. [anchoring] [sentence-craft]
- **B (Sonnet 4.6)**: midsize-firm specialisation, then the same firms as proof. Better judgment, too long. Weak, not Ship. [wordy] [sentence-craft]
- B ran Specialization, Craftsmanship, Modularity. A ran Specialization, Modularity, Low friction. [label-choice]

## Findings after ten cards

These change the build. Each is stated once, with the evidence that produced it.

1. **Sonnet 5 is losing on judgment, not prose.** Picks 8 to 1 to 1 for Sonnet 4.6 over Sonnet 5 over neither. Sonnet 4.6: 4 Ship, 5 Weak, 1 Slop. Sonnet 5: 0 Ship, 6 Weak, 4 Slop. The assumption that the stronger writer would read better failed in his own verdicts. The winner is still mostly Weak, so the flip stays off.
2. **Sonnet 5 has one nameable habit: anchor on the most dramatic fact and build the read around it.** Cognition on Windsurf. DeepInfra on NVIDIA-investor timing. Neko on $4M revenue against $325M raised. Suki on the competing-EHR paradox. The cause is structural: the sentence slot rewards the punchiest fact, and pass 1 reasons and writes in one breath, so the punchy fact drags the judgment. This is the evidence for separating the judge pass from the writer passes.
3. **Sonnet 4.6 has the mirror habit: breadth without commitment.** Completeness in two of four reads, Specialization in two of four, hedges inside the sentence. It fails the corpus-wide label-habit gate for the same reason. The shape that wins is Sonnet 4.6's prose with labels chosen by a judge, not by habit.
4. **The Cognition miss is judgment, not evidence.** Nine mentions of the cloud-agent bet in the frozen card; neither writer made it the center. A judge with a standard catches this. A smarter writer did not.
5. **All three phrasing bans are manufactured by the prompt.** "The read would weaken" comes from the wrong_if slot asking about the read. "Is observed fact" comes from the certainty-statement rule. "On the card" comes from the task calling the evidence "the company's card." Fix the prompt: wrong_if is a plain conditional about the world; certainty lives in the verb, never as a tag; the input is never named. Add all three, and the pattern "would weaken if", to the banned list and the hostile editor's checks.
6. **Meaning lines: render the canonical one.** Core holds a meaning sentence for all 80 strategies. Show it for running, pair, and next; stop asking the model to write its own. Removes variance and tokens, and covers his ask.
7. **Confidence tag maps onto the judge vote.** Three draws; 3 of 3 reads high, 2 of 3 reads medium; no percentages.
8. **Process parity holds; the smarter model loses because it obeys the prompt harder.** Checked across all 40 arms: same four passes, prompts, DeepSeek editor (zero skips either side), verifier, evidence, seeded A/B. Style violations left after the editor: 3 for Sonnet 5, 20 for Sonnet 4.6. The sentence slot asks for "stark evidence and mechanism, taken in at a glance"; Sonnet 5 optimises that and anchors on the sharpest hook. Sonnet 4.6 half-ignores it, writes broader, and broader is what Samay picks. The prompt asks for the thing he dislikes, and the weaker model's non-compliance is saving it. A smarter writer amplifies a spec flaw; it does not correct one.
9. **Sonnet 5 reaches further and the verifier trims it harder.** 67 running claims against 60; verifier drops 4 against 2 running, 7 against 4 pairs; a pair survives in 13 of 20 Sonnet 5 reads against 16 of 20 for Sonnet 4.6. Bolder inference, thinner survivor.
10. **One asymmetry to close, not an excuse.** Sonnet 5 thinks by default: median 23.9k output tokens per read against 7.7k, inside the same 16k-per-pass cap. Fits on the numbers (worst case about 12k per pass), but the empty-text fallback that can switch thinking off is not logged per arm. Arm files gain a per-pass record before any tournament.
11. **Twenty is more than the writer pick needs.** Ten reads, stop. The second ten stay unread as the holdout for the revised pipeline; reading them now would spend the test set.
12. **Source parity holds.** Checked in the rig and the driver: one packet per card (`cardForHowItWinsPrompt`, same facts, signals, citations, and snippets), built once and handed to both arms; no per-model truncation. Sonnet 4.6 did not see more sources. Samay's wider point stands as a product question: if any future arm wins on evidence volume, the fix is the pipeline's source budget for every model, never a per-model allowance.
13. **Two label rules surfaced from his own words.** Prestige: a top-tier cap table is not Prestige (Notion, Profluent). Iteration: shipping and raising is not a feedback loop (Doppel). Both go into the judgment standard as he wrote them.
14. **Profluent is the split in one card.** Sonnet 4.6's judgment, Sonnet 5's sentences, both Weak alone. The judge pass and the writer pass want different models.
15. **Bland is the split with no winner.** Pick neither. Sonnet 5's intro, Sonnet 4.6's insights; Specialization doubted, Secrecy rejected, Reliability and Security kept from opposite arms. Two of ten cards now refuse a single-model winner.
16. **"Running" is UI slop.** Card 10. The heading is the schema slot leaking onto the page, same family as "on the card." Rename it. Pair and Not yet already use human words; Running does not.
17. **Do not lead the sentence with customer names.** August A opened on Hicksons, ELP, and a Florida team. The company and the mechanism come first; named customers are proof, not the lede.
18. **Prestige from Sonnet 5 is a habit.** Notion next, Profluent running, Hebbia running. Three of ten. The cap-table rule is not hypothetical.
19. **The flip rule fires HOLD.** Four Ship against five Weak on the winning arm is not "mostly Ship." `HOW_IT_WINS_ENABLED` stays false until the judge split lands. Cards 8-10 did not reverse the seven-card finding; they confirmed it.

## What is tabled (do not start until the next work sitting)

Recorded 2026-08-21. This queue stays frozen. No prompt edits, no judge-split code, no tournament, no holdout reads in this close.

1. Prompt edits: wrong_if as a world-conditional; certainty in the verb; never name the input; ban "the read would weaken", "is observed fact", "on the card", "would weaken if"; hostile editor checks for them.
2. Canonical meaning line rendered for every strategy, running / pair / next. Rename the Running heading.
3. Judgment standard, Samay's document, drafted from these notes verbatim. Load-bearing lines he already spoke: Prestige needs the brand to change a buyer's decision; Iteration needs a feedback loop, not a release count; absence of data is never analysis; ask what the company's actual bet is (Cognition); sibling labels need a reason to differ; a pair has to exclude something before it counts.
4. Judge pass split from the writer: structured verdict first, three draws, majority vote, 3/3 vs 2/3 as confidence. Writer renders and may not add, drop, or swap a strategy.
5. Per-arm parity record: attempts, thinking on or off, prompt hash.
6. Writer tournament on fresh never-seen cards, champion vs DeepSeek v4-pro, `openrouter/openai/gpt-5.6-sol`, Fable 5 on a few. Champion is Sonnet 4.6 as writer only, not as judge.
7. Holdout ten, unread, judged only against the revised pipeline.

## How the two evals proceed

They answer different questions. Do not merge the sittings.

| Eval | State | Question it answers | Next sitting |
| --- | --- | --- | --- |
| How it wins | 10 of 10 closed. Holdout sealed. Judgment standard and judge build complete. The first 30-arm topology base is historical because grouped handoffs were broken. | Which repaired topology makes the strongest evidence-grounded judgments? | Run the separately approved two-card pilot across all three repaired shapes. |
| Corpus quick-pick | 9 of 19. Ledger in this repo, `eval/curation/`. The clone at `~/cold-start-eval/repo` has only the same 9 quick-picks and no how-it-wins lane. Resume here. | Which full card makes him smartest about the company? | Low-energy sitting: rounds 10-19 at `/eval`. Then deep singles on the finalists. |

Do not start golden eval, Jun 16 quality seams, or the teach walkthrough until this queue has been converted into prompt and standard changes. Those are later Cold Start sittings, not this close.

Cross-eval rules that already have enough evidence to write down (both sittings, do not wait for more cards):

- Absence of data is never analysis (quick-pick round 7, how-it-wins Cognition/Doppel/Neko).
- Template questions and leaked instrument language are the same bug ("ask for one referenceable production customer"; "on the card"; "Running"; "is observed fact").
- Nuance and a named mechanism beat a dramatic fact (quick-pick every round; how-it-wins Sonnet 5's anchoring habit).
- Durable compounding advantage is the missing dimension on the full card; how-it-wins is the place that dimension should live, once a judge exists.

The earlier recommendation is complete. The current How it wins sitting uses one shared semantic contract across all three topologies. Do not read more cards or run the canceled repeats from the broken contracts.

## Work sitting update, 2026-08-21

- Prompt repair, canonical meanings, the human heading, and the authoritative judgment standard are complete.
- The [ChatGPT framework-mapping prompt](../../../docs/superpowers/specs/2026-08-21-how-it-wins-framework-mapping-chatgpt-prompt.md) is saved for downstream ingestion.
- Both ChatGPT responses remain raw source records. Samay's decisions now live in the authoritative [judgment standard](../../../docs/superpowers/specs/2026-08-21-how-it-wins-judgment-standard.md). The [strategy rubric](../../../docs/superpowers/specs/2026-08-21-how-it-wins-strategy-rubric.md) covers all 80 exact canonical labels and meanings and corrects the four identified source conflicts.
- Samay decided the current strategy judgment has no numerical cap. The all-80 audit keeps every strategy that earns inclusion; reader disclosure is separate. The unusual pair is a secondary, optional judgment. The [judge architecture draft](../../../docs/superpowers/specs/2026-08-21-how-it-wins-judge-architecture-draft.md) records the original grouped-scout hypothesis and the measured update that supersedes it.
- The judge build is complete. It has an uncapped validated all-80 verdict, bounded group scouting, retry and fail-closed handling, private full-audit retention, complete per-call telemetry, and a frozen-writer boundary. No model was run.
- The clean transport-hashed topology pilot ran all six arms under the approved $16 cumulative cap. All six failed closed. Three arms reached pre-critic output, but none produced a valid verdict. No critic or adjudication call ran. The clean pilot cost $3.049785, bringing cumulative spend to $11.852458, including $3.545736 from compatibility probes and one interrupted arm.
- The no-provider reliability repair is complete. Valid one-layer JSON envelopes now normalize without filling judgment fields. Bet map, global, critic, and adjudication calls retry one transient connection failure or timeout. Direct strong stages have bounded deadlines. Per-attempt checkpoints preserve cost and completed work across interruption and resume. The global judge must explicitly keep the frozen bet map or revise it with a cited override.
- The repaired two-card pilot completed all six arms under the approved $23.50 cumulative cap. Two verdicts were valid, one monolith and one four-bundle result on different cards. No topology cleared both cards. All six reached pre-critic output. Two critics found no issues, and no adjudication ran. Pilot spend was $6.346450, bringing cumulative spend to $18.198908. The run took 1,810,008 ms.
- The repair held mechanically. No connection or timeout retry was needed. All 57 attempts, six arm files, traces, and costs reconcile, and source parity is exact. The two valid verdicts pass the all-80 schema. Three multi-stage global outputs omitted the explicit bet-map decision because the live tool schema describes the field but does not require it. Core rejected them. One monolith used two unknown evidence IDs and also failed closed. The ten-card batch did not start, and no topology was chosen. Next decide whether to open one narrow no-provider contract repair. Any later pilot needs a new cost gate. The full benchmark, parity record, writer tournament, and only then the unread holdout remain queued.
- The narrow no-provider contract repair is complete. Code now owns the frozen bet map after the bet stage and carries it forward exactly unless the global judge returns an explicit cited revision. Multi-stage provider output no longer repeats the map. Every provider evidence-reference field is restricted to the exact registry for that call, while core keeps its unknown-ID rejection. The focused tests, typechecks, lint, and 30-arm dry run pass. The dry run made 250 fake calls and zero provider calls. The transport hash changed, six next-pilot IDs are fresh, prior private artifacts are unchanged, and spend remains $18.198908. Next is one separately approved two-card pilot under the proposed $29.05 absolute cumulative cap. The full benchmark, parity record, writer tournament, and unread holdout remain queued.
- The fresh contract-repair pilot completed all six arms under the approved $29.05 cumulative cap and failed the stop rule. The four multi-stage arms stopped after the bet mapper serialized `materialBets` as a string. Both monolith judgments cited unknown evidence IDs. No verdict validated, so no critic or adjudication ran. The pilot cost $2.162965 and took 893,847 ms, bringing cumulative spend to $20.361873. Run files, attempt costs, traces, and source parity reconcile. The full ten-card benchmark did not start, and no topology was chosen. Any further contract repair or paid pilot requires a separate sitting. The parity record, writer tournament, and unread holdout remain queued.
- The final bounded no-provider repair is complete. The bet mapper accepts one valid JSON string layer around the complete `materialBets` array and rejects prose, partial JSON, objects, or repeated string layers. Provider requests use short deterministic evidence handles that code maps back exactly to the frozen evidence registry; unknown handles still fail closed. The focused 54 tests, affected typechecks, lint, manifest checks, and 30-arm dry run pass. The dry run made 250 fake calls and zero provider calls. The transport hash changed, six next-pilot IDs are fresh, and cumulative spend remains $20.361873. The next action is a separately approved two-card pilot under a proposed $31.21 absolute cumulative cap. The full benchmark, parity record, writer tournament, and unread holdout remain queued.
- The fresh pilot cleared its stop rule. Monolith produced valid all-80 verdicts on both cards. Four bundles and 13 groups each failed bet mapping on one card because the result was not a valid array. Both reached global judgment on the other card and then failed closed after reusing evidence handles as claim or bet IDs. The two critics changed no judgment and triggered no adjudication. All six arms, 28 attempts, traces, costs, and source parity reconcile. Pilot spend was $3.782958 and wall time was 819,856 ms, bringing cumulative spend to $24.144831. The ten-card batch has not started. The proposed $140 absolute cap covers the projected base, every frozen repeat and order perturbation, and bounded retry and adjudication headroom. The runner still needs deterministic repeat, aggregate, and blind-packet support before any full-batch provider call.
- The zero-provider benchmark harness is complete. Base execution is limited to the 30 frozen arms. Adaptive divergence repeats, seeded agreement controls, and the nine order-only perturbations are planned separately and cannot run under the base approval. Aggregate reconciliation and the private seeded blind packet are implemented. The focused benchmark, core, and LLM tests, workspace typechecks, lint, privacy checks, and the 30-arm dry run pass. The dry run made 250 fake calls and zero provider calls. Spend remains $24.144831. Next is approval of a $52 absolute cap for the base comparison only. Six pilot arms will be reused and 24 arms will run. Any repeats need a second approval.
- The 30-arm base comparison completed under the approved $52 cumulative cap. Seven verdicts validated, all from monolith. Four bundles and 13 groups produced no valid verdicts; 23 arms failed closed. Base arm cost was $18.119690, with $14.336732 of new spend, bringing cumulative spend to $38.481563. Wall time was 4,625,458 ms. All 115 traces, saved attempts, costs, and frozen hashes reconcile. Seven cards materially diverged. No card had three valid agreeing topologies, so there are no agreement controls and the two-control shortage is explicit. The harness calculated 42 divergence repeats plus nine order-only perturbations under a proposed $102 absolute cumulative cap. Production remains disabled and the unread holdout remains unread.
- Samay stopped the repeat plan after reviewing the failure paths. The proposed $102 cumulative cap is not being requested. Thirteen of the twenty grouped arms stopped when the bet mapper returned text instead of the list required by the next stage. The other seven grouped arms reached the global judge but reused temporary evidence handles as claim or bet identifiers. No grouped verdict survived to a judgment-quality comparison. The next sitting is a no-provider simplification: one strong judge call, code-owned identifiers and reference resolution, unchanged truth gates, and deterministic replay of the three monolith failures. The seven valid monolith verdicts remain evidence. Any later paid check reruns only the failed cases plus deterministic controls under a separate cost gate. Production remains disabled and the unread holdout remains unread.
- Samay superseded the one-call-only direction. The fair no-provider repair gives monolith, four bundles, and 13 groups one semantic output contract. Models return bets, mechanisms, dispositions, evidence handles, local bet references, distinctions, and ordering. Code assigns durable bet, claim, question, disagreement, and critic identifiers. Unknown evidence, incomplete all-80 judgments, missing reasons, and invalid local references still fail closed. The focused core, judge, and benchmark tests pass. All workspace typechecks and lint pass. The 30-arm dry run made 250 fake calls and zero provider calls. A new experiment identity preserves the completed base run unchanged. Spend remains $38.481563. All three topologies remain candidates pending a separately approved two-card pilot. Production remains disabled and the unread holdout remains unread.
- The next pilot returned no valid verdicts. Four arms failed at mechanical boundaries and two failed at the provider connection. One 13-group arm completed all 80 decisions but was rejected because one row included an extra `reason: null` field. Three grouped arms returned the bet list in an unaccepted container, and the old harness had not saved the rejected provider envelope. The pilot cost $1.583194, bringing cumulative spend to $40.064757. The flexible transport repair now accepts bounded unambiguous bet-list wrappers, removes only unknown null fields, and stores every raw tool result privately before normalization. Required judgment fields, evidence references, and all-80 validation remain strict. Ten core tests, 26 judge tests, 33 benchmark tests, all workspace typechecks, lint, and the 30-arm dry run pass. The dry run made 250 fake calls and zero provider calls. The next action is a separately approved two-card pilot under the new transport identity. Production remains disabled and the unread holdout remains unread.
- The following pilot again returned no valid verdicts, but private raw capture made the causes exact. Three grouped arms returned a valid bet array after the literal provider tag `<parameter name="materialBets">`. One grouped arm reached global judgment, but the provider serialized the whole verdict inside a second giant JSON string and returned invalid JSON. Two monolith arms failed at the provider connection. The six arms cost $1.444679, bringing cumulative spend to $41.509436. The no-provider repair now returns verdict fields directly, strips only the exact observed parameter tag when the remaining value parses correctly, and resolves evidence handles after parsing. It does not invent missing semantic fields. The next action is a separately approved two-card pilot under the new transport identity. Production remains disabled and the unread holdout remains unread.
- The next pilot produced three valid all-80 verdicts. Monolith completed both cards, and 13 groups completed one. The other three grouped arms stopped at bet mapping. Raw capture proved that each contained one leading newline, then the exact supported parameter tag, then a valid bet array. The pilot cost $3.767140, bringing cumulative spend to $45.276576. Three critics changed no judgment, and no adjudication ran. The field-by-field cleanup is now one recursive schema-guided normalizer for mechanical array and object wrappers at any depth. It never rewrites semantic strings or supplies missing judgment content. The saved failures replay successfully. A private blind pilot review is ready. Samay approved a $53 absolute cumulative cap for rerunning only the three affected arms under the new transport identity. Production remains disabled and the unread holdout remains unread.
- The three affected arms were rerun under the $53 cumulative cap. The proven whitespace and provider-tag wrapper no longer blocks valid content, and one four-bundle arm returned a valid all-80 verdict. One 13-group bet list was unfinished and could not be accepted without guessing. One four-bundle judgment referred to a nonexistent second local bet and failed the strict contract. The rerun cost $1.889333 and took 501,788 ms, bringing cumulative spend to $47.165909. One critic raised ten nonmaterial notes, changed no judgment, and triggered no adjudication. The six latest pilot outcomes now contain four valid verdicts and two failed-closed results. The private blind review is refreshed. Next is Samay's review before any full benchmark. Production remains disabled and the unread holdout remains unread.
- The pilot judgment review is complete. Samay selected Cognition Arm B overall, while preferring some elements of A and questioning whether either answer reaches the quality ceiling. For Bland, he kept Arm A's two separate bets and Arm B's Reliability plus Specialization strategy set. The complete audit treated Completeness and Security as open questions rather than current strategies. The provider boundary gives incomplete structured output or an unknown local bet reference one correction attempt with the validation error. A second invalid result still fails closed. No new provider call ran. Spend remains $47.165909. Next is the decision on the full ten-card comparison.
