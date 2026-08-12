# Resonance, Audience, Tagline, and 10x Opportunities

Written 2026-08-11. Built from four research passes (product truth, market evidence, measured cost and speed, complexity audit) plus direct review of the live card, landing, and extension screenshots. Numbers below were measured against production that day. Challenge anything here; each section names what would falsify it.

Status: no alpha invites have been sent yet. Every claim about users is about future users. There is no usage evidence in either direction.

## 0. The value, said right (Samay's frame, 2026-08-11)

The value is getting smarter about a company in a nuanced way, early. Investors hold generic knowledge about companies until a live deal forces depth, because their tools are generic: a database's whole value is comparability, every company gets the same fields, and what fits in a column is by construction what every company has in common. What makes you smart about a company is everything else: who actually pays, why now, what breaks, what to ask. Old tools cannot hold that; their unit is the row. Cold Start's unit is the read.

Three consequences:

- The structural flaw being attacked: investors decide which companies deserve deep time using their shallowest knowledge. Upgrading pre-decision knowledge is the most consequential point in the funnel.
- The moat form: PitchBook cannot follow by adding a feature, because the genericness is the data model, not a gap in it.
- The honest ceiling: the claim is "smarter than everyone who has not spent the day yet," never "as smart as the person who spent a week." Keeping that scope is what makes it believable.

The three-beat spoken frame: (1) investors know companies generically until a deal forces depth; (2) not their fault, the tools were built when coverage was the hard part; (3) nuance used to cost a day, now it costs a minute, so start nuanced.

Working lines (Samay rewrites in his own voice before any public use):

- "Databases can only hold what every company has in common. What makes you smart about a company is everything else." (manifesto line; comparison-section header)
- "Most tools tell you what every company is. This tells you what this company is."
- "There's a difference between knowing of a company and knowing it. This closes that gap in about a minute."
- "Never be generic about a company again." (story-shaped tagline; see section 3 for how it pairs with the promise-shaped one)

Division of labor between story and promise: speak the story, print the promise. The generic-knowledge story is the meeting-a-human pitch; "the first ten minutes, already done" is the landing promise; "every line keeps its source" is the proof.

## 1. Will this resonate?

Yes, conditionally. The condition is reliability, not features.

The case for resonance rests on three measured facts:

- Trust in AI research output is falling right now. 72% of B2B buyers fact-check AI output always or very often, up from 58% a year earlier. Fabricated citations in academic papers rose roughly twelve-fold in three years. Deloitte refunded AUD $98k over fabricated citations in a government report. (Sources: TrustRadius 2026 Buying Disconnect via MarketScale; Nature d41586-026-00969-z; Forbes 2026-05-12.)
- No incumbent sells provenance. Crunchbase says "Make better decisions, faster." Harmonic says "The startup discovery engine." Specter says "Be the reason your fund wins the deal of the decade." Perplexity says "Where Knowledge Begins." Everyone claims speed or scale. Nobody's headline claims you can check their work. That position is empty and Cold Start already is that product.
- The complaint clusters line up. Crunchbase and AngelList get called stale. PitchBook costs about $20k a seat and is thin on young companies. Perplexity and ChatGPT deep research get called fast but unverifiable ("only did about 60% of the work... presented as if it was 100%", HN thread 43133207). Fast plus cited plus checkable, priced for an individual, is the open seam.

What I saw with my own eyes supports it. The conflict panel ("Both values stand. Cold Start does not average sources."), the Risk row, the Next question row, the FILED stamp: these read as an object with a spine, not another AI dashboard. The card is shareable and defensible. That is rare.

What would kill resonance:

- Reliability. 16 of 50 runs failed in the 7 days before this doc. The same-day investigation named every cause: 12 Anthropic credit exhaustion on operator test runs, 1 Postgres outage, 1 malformed model JSON, 2 correct refusals on thin evidence. The blocker is now narrow: keep both wallets funded and watch the one recurring malformed-JSON class. A trust product that fails a friend's first run is dead at hello.
- Integrity drift in our own copy. The landing says "Under 10 cents per full profile." Measured median full-profile cost is $0.435 to $0.481 (June measurement, n=28 basics / n=4 analysis; skip-fresh has cut analysis cost since, but no fresh full-profile measurement exists). Either make the claim true, re-measure and prove it, or change the claim. The product that sells citations cannot carry an uncited number in its own hero section.
- Episodic need. Most people look up companies in bursts. The extension helps because it lives where the moment happens, but habit will depend on the library being already-filed (see 10x #1).

Falsifier: send 10 invites to real deal people after reliability is fixed. If fewer than half run a second company within two weeks, the wedge audience is wrong or the moment is weaker than the evidence suggests.

## 2. Core audience, and how to say it

Ranked by confirmed pain times willingness to adopt:

1. Early-stage deal people: VC associates, scouts, angels, operator-angels. Confirmed monetized pain (they already pay Crunchbase, Harmonic, Specter). The product's own language (bull case, bear case, what must be true) is already their language. This is the wedge.
2. BD and sales pre-call research. Confirmed pain and budget, but the investor voice does not serve them without re-voicing. Expansion, not wedge.
3. Founders sizing competitors and partners. Adjacent, self-serve, low touch.
4. Job seekers evaluating startups. Real pain, no budget. Good for public-card distribution, not revenue.

The unifying trait is not a job title. It is a moment plus a stake: someone meets a company cold and gets judged on what they say about it next. The card is armor for that moment because every line survives the "where is that from?" question.

How to vocalize the audience: "People who start cold on companies for a living. Investors first." The product name already names the moment.

Falsifier: if BD users out-activate investors in the alpha, re-voice the lens per audience instead of forcing the investor frame.

## 3. Tagline

Recommended: **"The first ten minutes on any company, already done."**

Structure first, words second. The promise is the read: what the company is, who pays, what could break, what to ask next. The citations are the reason to believe the read, not the reason anyone wants it. positioning-vs-pitchbook.md already states this rule ("Citations and price are proof points, not the headline") and the first draft of this section broke it by leading with the trust claim. Corrected 2026-08-11 after Samay's challenge.

So the pair is:

- Headline: "The first ten minutes on any company, already done." It names the want, it is concrete, and it is the product's own honest scope ("a replacement for the first 10 minutes on any company").
- Proof line beneath: "Every line keeps its source." (The compressed form of "company research that shows its work," which stays as the proof register, never the headline.)

Wit alternate, if the surface can carry personality: **"Meet a company cold. Sound like you didn't."** Names the moment and the real payoff (reputation in the room). Better spoken than printed.

CTA variant: **"Pull the file on any company."** Matches the catalogue-card object language (FILED, call numbers, the stamp).

The spoken version, for meeting a human:

"You know how when you hear about a startup you open ten tabs and still don't really know what it is? This does the first ten minutes for you. One card: what they do, who pays them, what they raised, what to ask on the first call. And every line has a source you can click, so you can actually repeat it to someone."

Kept for iteration, not recommended as headline:

- "Company research that shows its work." (the trust claim; correct as proof line, wrong as promise)
- "Every fact, filed and cited." (matches the stamp, but static; no user moment)
- "The file on any company, with receipts." (punchy; "receipts" may age badly)

Current hero ("Deeply understand the companies you care about") is generic-positive. Any research tool could claim it. Recommend replacing.

### Copy pack (2026-08-11, Samay picks and rewrites; nothing ships verbatim without his pass)

Spoken, ten seconds: "You give it any company and in about a minute you get the file: what they do, who pays them, what could break, what to ask first. Every line has a source. It's for the moment you meet a company cold."

Spoken, thirty seconds, the story version: "Most investors know companies generically until they're deep in a deal. Not lazy, the tools are generic. PitchBook gives every company the same twelve fields because it was built when coverage was the hard part. So everyone carries the same tile: category, round, logos. The nuance, who actually pays, why now, what breaks it, only shows up after someone burns a day. Cold Start hands you the nuanced version up front. One card, about a minute, every line sourced. You start smart instead of getting smart late."

One breath, when someone asks what it is: "The first ten minutes on any company, already done."

Objection line, "so it's like Crunchbase?": "Crunchbase tells you what every company is. This tells you what this one is."

Landing rewrite, bold version:

- Hero H1: "Never be generic about a company again."
- Hero sub: "Cold Start builds the file on any company in about a minute. What they do, who pays, what could break, what to ask first. Every line keeps its source."
- Comparison section header (replaces "Cold Start can replace PitchBook"): "Databases hold what every company has in common."
- Comparison intro: "Category, round, headcount, logos. Useful, and the same for everyone. What makes you smart about a company never fit in a column. Cold Start files that part: the read, the conflicts, the open questions. PitchBook stays what it is. You stop needing it for the first look."
- Sources section header: "Where every line comes from." (legend unchanged)
- Extension section: keep "A companion for understanding a company, not just looking it up." It already carries the idea.
- Footer: keep "Public facts, cited. Not investment advice."

Landing rewrite, safe version: same everywhere except hero. H1 "The first ten minutes on any company, already done." Sub "One filed card: what they do, who pays, what could break, what to ask on the first call. Every line keeps its source."

Choice logic: the bold hero names the enemy and is more memorable; the safe hero promises the concrete win and risks nothing. If the catalog is thin at launch, the safe hero over-delivers and the bold one over-promises. Pick after the library-flip decision.

### Spark markers (Samay writes from these; the finished lines above are fallback, not the plan)

Samay's call 2026-08-11: generated copy lines read AI-coded. The working method is spark material he writes from, not drafts he edits. Spiral's humanize pass left the 30-second spoken pitch nearly untouched, so the spoken register is close; heroes get written fresh from the markers below.

The one big direction: let the card speak. The product's own microcopy is the voice ("Both values stand. Cold Start does not average sources." / "Not a recommendation. The first thing this ledger cannot answer."). Write the landing as that narrator: flat, filed, declarative, zero persuasion. That voice cannot flatter, so it cannot slop.

True things that carry feeling:

1. The card refuses to average. Two headcounts disagree, both stay, with dates.
2. The verifier deletes claims it cannot prove. Sometimes it withholds the whole read. A research tool that can say "not enough."
3. Every company gets a call number and a FILED stamp with a date. A startup gets a library card.
4. The card ends by naming what it cannot answer, and that becomes the first call question.
5. A dime a card against a $20k seat. One seat of PitchBook buys 250,000 profiles.

Tensions to build a line from:

6. Knowing of a company against knowing it.
7. The tile against the read. The column against the card.
8. Coverage was the old hard part. Nuance is the new one.
9. Everyone's first look at a company is identical. Genericness is not shallow, it is same.
10. Getting smart late against starting smart.

Images:

11. Ten tabs open, still cannot say what the company does.
12. Pulling a file from a drawer. An archive of companies that did not exist last year.
13. The seal inking up while sources load. Research you can watch happen.

Constraints for the writing pass: one real noun per line (stamp, drawer, tab, receipt), zero abstractions (insights, intelligence, signal). If the line would sit fine on Harmonic's site, kill it. If it sounds like a slogan, it is wrong; "Both values stand" is the register.

## 4. 10x opportunities

Ranked by conviction times payoff. Big swings first.

### 4.1 The library flip (biggest swing)

Today Cold Start is a tool you run. Flip it to a library that already exists. Basics generation without contact enrichment should cost roughly $0.12 to $0.15 a card (contact enrichment via Websets is 57% of basics cost and is not needed for pre-filed cards). About $1.5k pre-files 10,000 companies: every YC batch, everything that raised in the last 90 days, the AI tooling landscape.

Why it is 10x: most lookups become instant (cache hit instead of 32 seconds). The catalog becomes real SEO and social surface instead of 42 cards. "We filed the entire YC batch" is a launch moment with a built-in audience. The stable-URL artifact thesis only compounds if artifacts exist in volume. This converts the unit-cost advantage (the one thing incumbents cannot copy) directly into distribution.

Prerequisites: reliability burn-down first, wallet funding, staleness handled by the TTL machinery that already exists. Verify the $0.12-0.15 no-contacts estimate with a 20-card batch before committing.

### 4.2 Show the work, literally

Every run captures a full evidence trace: sources tried, claims dropped by the verifier, dollars spent. No user has ever seen it (confirmed: nothing under apps/web or the extension renders traceJson). A "how this card was built" panel is nearly free and is the maximal trust move: showing what we refused to say proves the thesis better than anything we do say. A small "N claims did not survive verification" mark on the card face would be the most honest line in the category. No competitor can copy it without rebuilding their pipeline honestly.

### 4.3 Kill the dead seconds

Basics p50 is 31.9s, p90 43.6s, and the QA attack list's top item is up to 32s of silent queue. The pipeline does not need to get faster for the product to feel 10x faster: stream facts into the card skeleton as they land (the extension already has clippings; the web card face can do the same), and show the first real fact under 5 seconds. Perceived latency is the metric; the extension's whisper and seal already prove the pattern works.

### 4.4 Reliability as a product surface

The 32% weekly failure rate was a blocker dressed as a statistic; the same-day burn-down named every cause (section 1) and the classifier now names them in alpha:status automatically. What remains is the product half: when a run fails, the card should say what happened in plain words and retry once free. A trust product earns more trust from an honest failure than from a silent one.

### 4.5 The Next Question engine

The card's best row generalizes. Today: one "Next question." The 10x version: a first-call pack of 3 to 5 questions, each tied to a specific evidence gap, each citing what is already known ("Customer proof is company-sourced only [5]; ask for one referenceable production customer"). Synthesis already produces categorized open questions, so this is judgment-layer elevation, not new pipeline. No database ends in an action. This one would.

### 4.6 Simplification (attention is the scarce resource)

Roughly 130k hand-written lines currently serve zero external users. Firefox is launch-required (Samay, 2026-08-11) and stays. The rest of the cut list:

- apps/video: 660 lines, 4 commits ever, output wired into nothing live. Wire the MP4 into the site or archive the workspace.
- Six overlapping generation-measurement scripts answer the same question. Collapse toward two (one latency/cost report, one gate).
- Provider-matrix eval: 1,386 lines, one run ever. Freeze until the next model-swap decision.
- Repair scripts: graduate the healed ones out of package.json into a docs runbook. Two of them patch recurring write-path drift; fix the source instead (repair:card-domains and repair:signal-clusters both re-derive what the write path should already guarantee).
- Alpha invite economy (951-line repository file, 7 tables): do not cut before launch, it is the launch vehicle. Stop growing it.

### 4.7 Distribution-native cards

Per-card OG images (the card is the image), copy-as-memo text export, and the /i/ personalization machinery generalized to "filed for you" links. Small pieces that compound with the library flip.

### Wild card, flagged not endorsed

An MCP endpoint serving cited cards into Claude and ChatGPT. SPEC lists it as a v0 non-goal and that stands. As distribution it is 10x-shaped: the chat tools that compete on research become clients, because a per-fact-cited card is exactly what they cannot produce. Revisit after launch.

## 5. Low-hanging fruit (fix before invites)

1. Reliability burn-down: done 2026-08-11, every failure named (credit exhaustion, one Postgres outage, one malformed-JSON bug). Remaining: fund the Anthropic account and require a green alpha:status before invites.
2. Landing cost claim: "Under 10 cents per full profile" is unproven at best. Re-measure or rewrite. (Integrity.)
3. Wallet: $31.02, below the $35 release floor. Top up.
4. CI gap: check.yml never runs test:cards-db, the suite that reproduces the July write-outage class. One line to add.
5. Queue-hold fix: the attack list's own #1 item.
6. AMO credentials: the only blocker on the launch-required Firefox lane.

## 6. Provenance and how to challenge this

Inputs: INTENT.md and SPEC positioning (read directly), landing/card/extension screenshots (reviewed directly), production measurements run 2026-08-11 (measure:first-usable n=54/14d, measure:analysis-latency n=63/30d, wallet:status, alpha:status), June unit-economics trace analysis (n=28/n=4, directional), market evidence with URLs in the research pass (TrustRadius/MarketScale, Nature, Forbes, HN 43133207, G2/vendor sites).

Weakest links, in order: the $0.12-0.15 no-contacts card estimate (derived, not measured); the June cost split (pre-skip-fresh, small analysis sample); audience ranking (inferred from market evidence, zero direct user data). The falsifiers in sections 1 and 2 are the cheapest tests of the whole document.
