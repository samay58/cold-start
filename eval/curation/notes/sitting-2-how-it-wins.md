# Sitting 2 notes, enriched: the How it wins blind read (2026-08-20, paused at 7 of 10)

Samay's dictated notes from the how-it-wins ledger, wording verbatim including dictation typos. Added here: which writer was which arm (revealed to him after each verdict), what part of the read each fragment is about, tags, and the findings that already change the build. Samay paused after card 7 (a break, not a stop; seven blind reads in a row is a lot); cards 8 through 10 finish on resume and are appended in the same shape. The second ten of the original twenty are held out, unread, as the test set for the revised pipeline.

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

## Findings after seven cards

These change the build. Each is stated once, with the evidence that produced it.

1. **Sonnet 5 is losing on judgment, not prose.** Picks 6 to 1 for Sonnet 4.6 after seven cards. Sonnet 4.6: 3 Ship, 3 Weak, 1 Slop. Sonnet 5: 0 Ship, 4 Weak, 3 Slop. The assumption that the stronger writer would read better is failing in his own verdicts.
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

## What changes, in order

- Prompt edits (small, after the sitting): wrong_if as a world-conditional; certainty in the verb; the two phrases plus "would weaken if" banned; hostile editor checks for them.
- Canonical meaning line rendered for every strategy in the crown and the rig.
- Judge pass split from the writer passes, three draws with a majority vote, its own model var and its own blind read. The judgment standard is Samay's document, drafted from these notes verbatim.
- Writer tournament on fresh cards (see the spec's queue): champion against each challenger, two arms per card, rig unchanged.
- Holdout: the unread ten of the original twenty, read only against the revised pipeline.
12. **Source parity holds.** Checked in the rig and the driver: one packet per card (`cardForHowItWinsPrompt`, same facts, signals, citations, and snippets), built once and handed to both arms; no per-model truncation. Sonnet 4.6 did not see more sources. Samay's wider point stands as a product question: if any future arm wins on evidence volume, the fix is the pipeline's source budget for every model, never a per-model allowance.
13. **Two label rules surfaced from his own words.** Prestige: a top-tier cap table is not Prestige (Notion, Profluent). Iteration: shipping and raising is not a feedback loop (Doppel). Both go into the judgment standard as he wrote them.
14. **Profluent is the split in one card.** Sonnet 4.6's judgment, Sonnet 5's sentences, both Weak alone. The judge pass and the writer pass want different models.

## Why the sitting paused at seven, and what it is for

Samay paused for a break, and because the first cards uncovered something bigger than a writer pick: the driver's judgment is an accident of which model obeys the prompt less, and the prompt itself manufactures the phrasing he bans. Resuming means cards 8 through 10 first; after that the work is not more of the same. The feedback above becomes: prompt edits (items 5 and 6), the judge split with the three-draw vote and his written standard (items 2, 4, 13), a parity record per arm (item 10), and only then the writer tournament on fresh cards. Cards 8 through 10 finish this sitting when it resumes; the holdout ten stay sealed.
