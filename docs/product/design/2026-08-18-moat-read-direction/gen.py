# Generates d1.html. Run: python3 gen.py && node shot.mjs
FONTS = "file:///Users/samaydhawan/Projects/active/cold-start/apps/extension/public/fonts"
CSS = f"""
@font-face {{ font-family: "AtUmami"; src: url("{FONTS}/AtUmamiVAR.woff2") format("woff2"); font-weight: 100 900; }}
@font-face {{ font-family: "AtTextual"; src: url("{FONTS}/AtTextualVAR.woff2") format("woff2"); font-weight: 100 900; }}
@font-face {{ font-family: "IBM Plex Sans"; src: url("{FONTS}/IBMPlexSansVAR.woff2") format("woff2"); font-weight: 100 700; }}
:root {{
  --field: #f7f5ee; --plate: #fffdf8; --ink: #171a1f; --muted: #68706a; --rule: #ccc7b8; --rule-strong: #9c978a; --seal: #6e5c9e;
  --reported: #315f9d; --company: #9b6a1e; --edge-highlight: rgb(255 253 248 / 0.7);
  --shadow-popover: 0 10px 26px rgb(23 26 31 / 0.10), 0 0 0 1px var(--rule);
  --font-display: "AtUmami", "IBM Plex Sans", sans-serif; --font-body: "IBM Plex Sans", sans-serif; --font-text: "AtTextual", monospace; --ground: #e4dcc8;
}}
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
html, body {{ background: var(--ground); }}
body {{ font-family: var(--font-body); color: var(--ink); -webkit-font-smoothing: antialiased; padding: 40px 40px 80px; }}
h1 {{ font-size: 22px; font-weight: 600; color: #20201e; margin-bottom: 10px; }}
h2 {{ font-size: 16px; font-weight: 600; color: #20201e; margin: 56px 0 18px; }}
.sub {{ font-size: 16px; color: #5c554a; max-width: 820px; line-height: 1.5; margin-bottom: 36px; }}
.frames {{ display: flex; flex-wrap: wrap; gap: 44px 40px; align-items: flex-start; }}
.frame {{ width: 372px; flex: none; zoom: 1.4; }}
.frame > .cap {{ font-size: 12px; line-height: 1.45; color: #5c554a; margin-top: 12px; padding: 0 2px; }}
.frame > .cap b {{ color: #20201e; font-weight: 600; }}
.panel {{ background: var(--field); border: 1px solid #c9bea4; border-radius: 10px; padding: 14px; box-shadow: 0 8px 28px rgb(23 26 31 / 0.08); }}
/* Lens plate, from research-trail.css */
.lens {{ display: grid; border: 1px solid var(--rule); border-radius: 6px; background: var(--plate); box-shadow: 0 1px 0 var(--edge-highlight) inset; position: relative; }}
.head {{ display: grid; grid-template-columns: 34px minmax(0,1fr) auto; align-items: center; gap: 10px; padding: 13px 14px 12px; border-bottom: 1px solid var(--rule); }}
.mark svg {{ width: 29px; height: 19px; display: block; }}
.title {{ display: grid; gap: 2px; }}
.title strong {{ font-family: var(--font-display); font-size: 14.5px; font-weight: 650; line-height: 1.1; }}
.title span {{ color: var(--muted); font-size: 11px; font-weight: 470; line-height: 1.35; }}
.head small, .foot small, .src {{ color: var(--muted); font-family: var(--font-text); font-size: 10.5px; font-weight: 500; letter-spacing: .24px; white-space: nowrap; }}
.row {{ border-bottom: 1px solid var(--rule); }}
.row:last-child {{ border-bottom: 0; }}
.trigger {{ display: grid; grid-template-columns: minmax(0,1fr) 18px; align-items: center; gap: 10px; min-height: 52px; padding: 9px 13px; }}
.copy {{ display: grid; gap: 3px; }}
.copy strong {{ font-size: 13.5px; font-weight: 650; line-height: 1.2; }}
.preview {{ color: var(--muted); font-size: 11.75px; font-weight: 450; line-height: 1.35; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }}
.plus {{ position: relative; width: 12px; height: 12px; color: var(--muted); }}
.plus::before, .plus::after {{ content: ""; position: absolute; top: 5px; left: 2px; width: 8px; height: 1px; background: currentColor; }}
.plus::after {{ transform: rotate(90deg); }}
.row.open .plus::after {{ transform: none; }}
.row.open .plus {{ color: var(--seal); }}
.body {{ padding: 1px 13px 16px; }}
.lede {{ font-size: 13.25px; font-weight: 470; line-height: 1.5; text-wrap: pretty; display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 4; }}
.cite {{ color: var(--muted); font-family: var(--font-text); font-size: 10.5px; letter-spacing: .2px; }}
.readfull {{ display: inline-block; margin-top: 8px; color: var(--muted); font-family: var(--font-text); font-size: 10.5px; letter-spacing: .24px; border-bottom: 1px solid var(--rule-strong); }}
.foot {{ display: grid; gap: 8px; padding: 10px 13px 11px; border-top: 1px solid var(--rule); }}
.srcs {{ display: flex; flex-wrap: wrap; gap: 6px 12px; }}
.src {{ display: inline-flex; align-items: center; gap: 6px; }}
.src i {{ width: 5px; height: 5px; background: var(--reported); }}
.src.company i {{ background: var(--company); }}
.foot small {{ justify-self: end; }}
/* The notched edge */
.crown {{ position: relative; border-bottom: 1px solid var(--rule); cursor: default; }}
.lblrow {{ display: flex; justify-content: space-between; align-items: baseline; padding: 9px 13px 0; font-family: var(--font-text); font-size: 10.5px; letter-spacing: .24px; color: var(--muted); }}
.lblrow b {{ font-family: var(--font-body); font-size: 12px; font-weight: 640; letter-spacing: 0; color: var(--ink); }}
.lblrow .readout {{ transition: color 120ms ease; white-space: nowrap; }}
.lblrow .readout.cut {{ color: var(--ink); }}
.edge {{ padding: 0 13px; height: 22px; margin-top: 2px; }}
.edge svg {{ display: block; width: 100%; height: 22px; overflow: visible; }}
.sig {{ padding: 2px 13px 9px; color: var(--ink); font-size: 12px; font-weight: 480; line-height: 1.4; text-wrap: pretty; }}
.crown[data-pinned="1"][data-accent="seal"] .lblrow b {{ color: var(--seal); }}
/* Note: the SharedTooltip memo variant */
.pop {{ position: absolute; z-index: 5; left: 13px; right: 13px; top: calc(100% + 5px); background: var(--plate); border-radius: 6px; box-shadow: var(--shadow-popover); padding: 11px 13px 12px; display: none; }}
.pop.on {{ display: block; }}
.pop::before {{ content: ""; position: absolute; top: -5px; left: calc(var(--ax, 50%) - 13px - 4.5px); width: 9px; height: 9px; background: var(--plate); transform: rotate(45deg); box-shadow: -1px -1px 0 var(--rule); }}
.pop .kicker {{ display: flex; justify-content: space-between; gap: 10px; align-items: baseline; margin-bottom: 5px; color: var(--muted); font-size: 12px; font-weight: 480; line-height: 1.4; }}
.pop .kicker b {{ color: var(--ink); font-weight: 600; }}
.pop .kicker small {{ font-family: var(--font-text); font-size: 10.5px; letter-spacing: .24px; white-space: nowrap; }}
.pop p {{ font-size: 13px; font-weight: 450; line-height: 1.5; }}
.pop .meta {{ margin-top: 8px; padding-top: 7px; border-top: 1px solid var(--rule); color: var(--muted); font-size: 12px; font-weight: 480; line-height: 1.4; }}
.pop .meta em {{ font-style: normal; font-weight: 600; color: var(--ink); }}
.pinned {{ position: absolute; right: 13px; top: 8px; color: var(--muted); font-family: var(--font-text); font-size: 10px; letter-spacing: .24px; }}
"""
MARK = '<span class="mark"><svg viewBox="0 0 29 19"><rect x="1" y="1" width="27" height="17" rx="2" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="14.5" cy="9.5" r="3.2" fill="currentColor"/></svg></span>'
def head(date): return f'<div class="head">{MARK}<span class="title"><strong>Investor Lens</strong><span>The case and what changes it</span></span><small>Filed {date}</small></div>'
def row(title, prev): return f'<div class="row"><div class="trigger"><div class="copy"><strong>{title}</strong><span class="preview">{prev}</span></div><i class="plus"></i></div></div>'
def whycare(text, cites): return f'<div class="row open"><div class="trigger"><div class="copy"><strong>Why care</strong></div><i class="plus"></i></div><div class="body"><p class="lede">{text} <span class="cite">{cites}</span></p><span class="readfull">Read full</span></div></div>'
def foot(srcs, date): return f'<div class="foot"><div class="srcs">{srcs}</div><small>Filed {date}</small></div>'
def crown(read_id, sentence, forced="", accent="seal", pinned="", count="4 of 80 strategies"):
    return f'<div class="crown" data-read="{read_id}" data-forced="{forced}" data-accent="{accent}" data-forcepin="{pinned}"><div class="lblrow"><b>How it wins</b><span class="readout" data-rest="{count}">{count}</span></div><div class="edge"><svg></svg></div><p class="sig">{sentence}</p><div class="pop"></div></div>'

IRR_WHY_TODAY = "Frontier AI labs must evaluate offensive-cyber capability in their models before release, and Irregular has positioned itself as the external lab those labs actually use: OpenAI and Anthropic are named customers, and Irregular's benchmarks appear in OpenAI system cards and Anthropic's Claude vetting process."
IRR_WHY_NEW = "Frontier AI labs must evaluate offensive-cyber capability before release, and Irregular is the external lab they use: OpenAI and Anthropic are named customers, and its benchmarks appear in OpenAI system cards and Anthropic's Claude vetting. Every new model needs a fresh evaluation, so revenue follows the labs' release schedule. The risk is a lab building this in-house before Irregular's benchmarks become the standard."
IRR_ROWS = [("What must be true","The buyer set is the most concentrated and well-funded in technology: OpenAI…"),("What could break","At 37 employees with 20 in research and only 1 open job posting, capacity…"),("What to learn next","Would OpenAI or Anthropic build this capability in-house rather than renew…"),("Pay attention to","Nothing notable.")]
IRR_SRCS = '<span class="src"><i></i>techcrunch.com</span><span class="src"><i></i>openai.com</span><span class="src company"><i></i>irregular.com</span><span class="src">+3</span>'
VELL_SRCS = '<span class="src"><i></i>techcrunch.com</span><span class="src company"><i></i>vellum.ai</span><span class="src"><i></i>linkedin.com</span><span class="src">+4</span>'
SENT = "Frontier labs use it to check new models before release, and trust it because no lab owns it."
def irregular(forced="", accent="seal", pinned=""):
    rows = "".join(row(t,p) for t,p in IRR_ROWS)
    return f'<div class="lens">{crown("irregular", SENT, forced, accent, pinned)}{head("Aug 12")}{whycare(IRR_WHY_NEW,"[e1] [e2] [e3]")}{rows}{foot(IRR_SRCS,"Aug 12")}</div>'
vellum = f'<div class="lens">{crown("none","Nothing stands out yet. It competes the way most LLM tooling companies do.", count="0 of 80 strategies")}{head("Aug 14")}{whycare("Vellum targets the gap between LLM prototype and production: enterprises that have proven a use case but cannot ship reliably because they lack versioning, evaluation, and observability in one system. With 150+ customers and ARR described as mid-seven figures, it has cleared early adoption; durability against LangChain is the open question.","[e6] [e13]")}{row("What must be true","A founding AI engineer&#39;s LinkedIn states he supported growth from low to mid…")}{row("What could break","The homepage as of early 2026 describes a personal AI assistant product…")}{row("What to learn next","Is the personal AI assistant on the homepage a new surface or a pivot…")}{row("Pay attention to","Own publishing has shifted toward a personal assistant while fundraising…")}{foot(VELL_SRCS,"Aug 14")}</div>'
today = f'<div class="lens">{head("Aug 12")}{whycare(IRR_WHY_TODAY,"[e1] [e2] [e3]")}{row("What must be true",IRR_ROWS[0][1])}{row("What could break",IRR_ROWS[1][1])}{row("Why now","Adoption trigger. Each new model generation requires a fresh evaluation cycle…")}{row("What to learn next",IRR_ROWS[2][1])}{row("Pay attention to","Nothing notable.")}{foot(IRR_SRCS,"Aug 12")}</div>'

PSENT = "OpenAI and Anthropic name Irregular's test benchmarks in their own model safety documents."
FSENT = "OpenAI and Anthropic cite its benchmarks by name in their model safety documents; dropping it later would show."
def fitted(forced="", accent="seal", pinned=""):
    rows = "".join(row(t,p) for t,p in IRR_ROWS)
    return f'<div class="lens">{crown("fit", FSENT, forced, accent, pinned, count="3 of 80 strategies")}{head("Aug 12")}{whycare(IRR_WHY_NEW,"[e1] [e2] [e3]")}{rows}{foot(IRR_SRCS,"Aug 12")}</div>'
def prompted(forced="", accent="seal", pinned=""):
    rows = "".join(row(t,p) for t,p in IRR_ROWS)
    return f'<div class="lens">{crown("prompt", PSENT, forced, accent, pinned, count="3 of 80 strategies")}{head("Aug 12")}{whycare(IRR_WHY_NEW,"[e1] [e2] [e3]")}{rows}{foot(IRR_SRCS,"Aug 12")}</div>'
main = [
 (today, "<b>Today.</b> Six rows. Why now is a seven-field form; on this card it filled four of the seven, and its one useful line (revenue follows the release schedule) belongs in Why care"),
 (irregular(), "<b>Proposed. Live: move your pointer along the edge.</b> At rest: a label, four marks, one bracket, one sentence. When the pointer arrives the scale of 80 fades in, the tick under it magnifies, and the name reads out top right. Only the marked ones and the bracket open a note; the sentence opens the pair. Click pins, Escape clears, arrows step. Why now is gone; its line is the last two sentences of Why care"),
 (vellum, "<b>Nothing unusual.</b> Uncut edge, and the sentence says so in plain words. A thin file reads \"Not enough filed\" on the same uncut edge"),
]
prompt_frames = [
 (prompted(), "<b>Prompt test, at rest (live).</b> Sentence, cuts, and notes all written by the three-pass prompt from Irregular's card. Three marks, two hollow, pair Hybrid and Chokepoint"),
 (prompted("32"), "<b>Prompt test, on Chokepoint.</b> The note as the hostile editor left it. About 90 words"),
 (prompted("pair"), "<b>Prompt test, on the bracket.</b> About 120 words plus the changes-if line"),
 (fitted("32"), "<b>Fitted (pass 4), on Chokepoint.</b> Same reasoning, shorter. The sentence here is hand-written to show the register Samay asked for: the stark fact plus what it does"),
 (fitted("pair"), "<b>Fitted (pass 4), on the bracket.</b> 70-word cap plus changes-if"),
]
record = [
 (irregular("11"), "<b>Passing an unmarked one (Craftsmanship).</b> The scale is visible, the tick under the pointer is magnified, the name reads out in grey. No note"),
 (irregular("54"), "<b>On one of its marks (Prestige).</b> Name, plain meaning, then the cited fact"),
 (irregular("pair"), "<b>On the bracket, or on the sentence.</b> The two together, cited, then what would change it"),
 (irregular("60"), "<b>On the hollow mark.</b> A way it could take next, with the condition"),
 (irregular("54", "seal", "1"), "<b>Pinned, seal accent.</b> The lilac question: this is the only moment the seal appears"),
 (irregular("54", "ink", "1"), "<b>Pinned, ink only.</b> Same state with no accent at all. Decide by eye"),
]
SCRIPT = r"""
const GROUPS = [6,4,4,9,11,11,5,3,3,9,7,5,3];
const NAMES = ["Usership","Completeness","Aggregation","Diversification","Omnipresence","Cloning","Affordability","Luxury","Skimming","Bundling","Heritage","Craftsmanship","Organic","Endurance","Specialization","Versatility","Hybrid","Divergence","Authenticity","Rarity","Scarcity","Secrecy","Irreverence","Violence","Litigation","Nettlesomeness","Sabotage","Parasitism","Scavenging","Espionage","Swarming","Highest bidder","Chokepoint","Puppeteering","Deterrence","Reliability","Predictability","Unpredictability","Decentralization","Security","Privacy","Durability","Neutrality","Obscurity","Antifragility","Camouflage","Mimicry","Decoy","Lure","Infiltration","First-mover","Second-mover","Last-mover","Monopoly","Prestige","Curation","Union","Alliance","Emergence","Centralization","Standardization","Symbiosis","Herding","Distributed ownership","Transparency","Iteration","Efficiency","Agility","Precision","Blitzing","Composability","Modularity","Intuitiveness","Fun","Simplicity","Low-friction","Charm","Malleability","Metamorphosis","Copycat"];
const NOTES = {
  14: { name: "Specialization", meaning: "Does one narrow thing well.", body: "Cyber evaluation of frontier models is the whole company. 20 of its 37 people are researchers on that one problem. <span class=\"cite\">[e3]</span>" },
  32: { name: "Chokepoint", meaning: "Sits where others have to pass.", body: "Frontier labs now get an outside cyber evaluation before a release, and Irregular is the one OpenAI and Anthropic use. OpenAI cites its benchmarks in system cards. <span class=\"cite\">[e1] [e2]</span>" },
  42: { name: "Neutrality", meaning: "Trusted because it belongs to no side.", body: "A lab can't credibly grade its own model, and it won't trust a rival's grader. Irregular is neither, which is why both labs use it. <span class=\"cite\">[e2] [e3]</span>" },
  54: { name: "Prestige", meaning: "Credible names vouch for it.", body: "Its benchmarks are named in OpenAI's system cards and in Anthropic's Claude vetting. The endorsement comes from the customers themselves, not from an award. <span class=\"cite\">[e1] [e2]</span>" },
  60: { name: "Standardization", meaning: "Becoming the measure everyone uses.", open: true, body: "Its benchmarks could become the standard cyber evaluation across labs and governments. That needs independent validation of the method; today they are cited because Irregular is the vendor, which is weaker footing. <span class=\"cite\">[e1] [e3]</span>" },
  pair: { name: "Chokepoint and Neutrality", meaning: "", body: "OpenAI and Anthropic both bring their models to Irregular for cyber evaluation before release, and OpenAI cites its benchmarks in system cards. <span class=\"cite\">[e1] [e2]</span> That works because Irregular is independent: a lab can't credibly grade its own model, and it won't trust a rival's grader either. <span class=\"cite\">[e3]</span>", meta: "a lab builds a large internal red team, or a government body takes over as the reference evaluator." }
};
const READS = { irregular: { cut: [14,32,42,54], hollow: [60], pair: [32,42] }, none: { cut: [], hollow: [], pair: null }, prompt: { cut: [16, 32, 54], hollow: [53, 60], pair: [16, 32] }, fit: { cut: [16, 32, 54], hollow: [53, 60], pair: [16, 32] } };
const NOTES3 = {"16": {"name": "Hybrid", "meaning": "Wins by pairing two skills rarely combined, hard to assemble.", "body": "Irregular builds live network environments with no planted vulnerabilities, having models attack and defend inside them. Benchmarks (Atomic Tasks, CyScenarioBench, FrontierCyber) measure actions like antivirus evasion, not answers <span class=\"cite\">[e1][e2][e3][e7]</span>. Inferred."}, "32": {"name": "Chokepoint", "meaning": "Controls a required passage; switching away costs something visible.", "body": "OpenAI's o3/o4-mini system cards and Anthropic's Claude 3.7 Sonnet cite Irregular's benchmarks by name <span class=\"cite\">[e1][e2][e3][s3]</span>. A switch would visibly change these citations. Durability beyond two labs: inferred."}, "54": {"name": "Prestige", "meaning": "Wins through endorsement from sources whose credibility is hard to fake.", "body": "Sequoia and Redpoint led funding; Wiz's Rappaport and Eon's Ehrlich invested personally <span class=\"cite\">[e1][e2][e3]</span>. TechCrunch and Calcalist independently reported ties to OpenAI and Anthropic <span class=\"cite\">[e1][e2][p1]</span>. Terms undisclosed: inferred strength."}, "60": {"name": "Standardization", "meaning": "", "open": true, "body": "Irregular's release claims it will 'set the security standards for frontier AI' <span class=\"cite\">[e3]</span>. Only OpenAI and Anthropic have adopted it; no independent convergence by other labs or bodies is shown."}, "53": {"name": "Monopoly", "meaning": "", "open": true, "body": "Irregular worked with the UK government <span class=\"cite\">[e2]</span>, showing a customer relationship, not regulatory mandate. No accreditation or legal requirement naming Irregular or its methods appears in the evidence."}, "pair": {"name": "Hybrid and Chokepoint", "meaning": "", "body": "Hybrid is the method: offensive red-teaming combined with AI evaluation in live network environments. Chokepoint is the result: those named benchmarks now appear in OpenAI's and Anthropic's safety documents. A competitor could not replicate this by publishing a better benchmark alone; the labs would have to replace an existing citation. Evidence: two reported adoptions <span class=\"cite\">[e1][e2][e3][s3]</span>. Anything beyond these two customers is inferred.", "meta": "If a lab could swap evaluators without changing its documentation, the switching cost disappears and this pairing collapses."}};
const NOTES2 = {"16": {"name": "Hybrid", "meaning": "Winning by combining two skill sets that are not usually housed together, so the combination itself is hard to assemble.", "body": "Irregular does not test AI models against fixed question sets. It builds network environments with no planted vulnerabilities and has the model act as attacker and defender inside them. Its benchmarks (Atomic Tasks, CyScenarioBench, FrontierCyber) measure actions such as antivirus evasion on live infrastructure rather than answers about how those actions work <span class=\"cite\">[e1][e2][e3][e7]</span>. This method is observable in the product description. The evidence does not show whether the founders' prior work directly involved offensive security or AI research <span class=\"cite\">[e12][e13]</span>, so the depth of in-house skill behind the hybrid is inferred, not demonstrated."}, "32": {"name": "Chokepoint", "meaning": "Winning by controlling a passage that competitors or customers must pass through, so switching away carries a visible cost.", "body": "Irregular's benchmark names and scoring framework are cited in OpenAI's system cards for o3 and o4-mini and are used by Anthropic to assess cyber risk in Claude 3.7 Sonnet <span class=\"cite\">[e1][e2][e3][s3]</span>. Two competing labs now reference the same external framework by name in documents attached to model releases. If either lab adopted a different evaluator for a later model, the citation would visibly change in that model's documentation. This creates a cost to switching, but the size of that cost is unknown. Adoption by two labs is a fact; durability of the arrangement beyond those two customers is an inference."}, "54": {"name": "Prestige", "meaning": "Winning by being endorsed, through association, by sources whose credibility is hard to fake.", "body": "Sequoia and Redpoint led the funding. Wiz CEO Assaf Rappaport and Eon CEO Ofir Ehrlich invested personal money <span class=\"cite\">[e1][e2][e3]</span>. TechCrunch and Calcalist independently reported that Irregular works with OpenAI and Anthropic, not just that Irregular says so <span class=\"cite\">[e1][e2][p1]</span>. Labs like these are selective about outside access to pre-release models, so the reports of working relationships function as third-party endorsement. Contract terms, duration, and revenue are not disclosed, so the strength of the endorsement cannot be measured directly."}, "60": {"name": "Standardization", "meaning": "", "open": true, "body": "Irregular's press release says it will 'set the security standards for frontier AI' <span class=\"cite\">[e3]</span>. The evidence shows adoption by OpenAI and Anthropic only, not independent convergence by Google DeepMind, Meta, or any standards body. This would require one of those parties to become a customer using the same framework as OpenAI and Anthropic, and the evidence does not show that."}, "53": {"name": "Monopoly", "meaning": "", "open": true, "body": "Irregular has worked with the UK government <span class=\"cite\">[e2]</span>, but that shows a government hired the firm, not that a regulator designated it as required or approved. This would require an explicit accreditation or legal mandate naming Irregular or its methodology. The evidence contains no such mandate."}, "pair": {"name": "Hybrid and Chokepoint", "meaning": "", "body": "Hybrid is the method: offensive red-teaming and AI evaluation combined in live network environments. Chokepoint is the adoption of that method's specific benchmark names in OpenAI's and Anthropic's safety documentation. The chokepoint depends on the hybrid method: it is the named benchmarks, built through live-environment testing, that appear in the system cards. A competitor cannot create the same position by publishing a better benchmark alone; it would need the labs to replace an existing citation in their own model documentation. No evidence shows why either lab would choose that. The evidence for the pairing is two reported adoptions <span class=\"cite\">[e1][e2][e3][s3]</span>; anything beyond those two customers is inferred.", "meta": "If either lab could adopt an alternative evaluator without a visible change in its safety documentation, the cost of switching would be zero and this pairing would not hold."}};
function positions(width) { const gap = 5, gaps = GROUPS.length - 1; const pitch = (width - gaps * gap) / 79; const xs = []; let x = 0;
  GROUPS.forEach(n => { for (let k = 0; k < n; k++) { xs.push(x); x += pitch; } x += gap; }); const last = xs[xs.length - 1]; return xs.map(v => v * (width / last)); }
const css = k => getComputedStyle(document.documentElement).getPropertyValue(k).trim();

document.querySelectorAll('.crown').forEach(crown => {
  const read = READS[crown.dataset.read]; const svg = crown.querySelector('svg'); const pop = crown.querySelector('.pop');
  const readout = crown.querySelector('.readout'); const accentSeal = crown.dataset.accent !== 'ink';
  const H = 22, TOP = 3; // TOP = y of the plate's top edge inside the svg
  const w = svg.getBoundingClientRect().width; svg.setAttribute('viewBox', `0 0 ${w} ${H}`);
  const xs = positions(w); const ink = css('--ink'), seal = css('--seal'), rule = css('--rule'), strong = css('--rule-strong'), field = css('--field');
  const targets = [...read.cut.map(i => ({ id: i, x: xs[i] })), ...read.hollow.map(i => ({ id: i, x: xs[i] }))];
  if (read.pair) targets.push({ id: 'pair', x: (xs[read.pair[0]] + xs[read.pair[1]]) / 2 });
  // state
  let hoverX = null, curX = null, scale = 0, target = null, pinned = crown.dataset.forcepin === '1', nearestTick = null, arrive = 1;
  function draw() {
    let out = '';
    // the plate's top edge, drawn here so cuts can interrupt it
    out += `<rect x="-13" y="${TOP}" width="${w + 26}" height="1" fill="${rule}"/>`;
    xs.forEach((x, i) => {
      const inPair = read.pair && read.pair.includes(i);
      const isCut = read.cut.includes(i), isHollow = read.hollow.includes(i);
      const dx = curX === null ? 1e9 : Math.abs(curX - x);
      const mag = scale * Math.exp(-(dx * dx) / (2 * 11 * 11)); // click-wheel falloff
      const hot = target === i || (target === 'pair' && inPair);
      const accent = (pinned && hot) ? (accentSeal ? seal : ink) : ink;
      if (isCut) {
        const depth = (8 + 4 * mag) * arrive, wd = 4 + 2 * mag;
        // a cut: the field shows through, ink walls and floor
        out += `<rect x="${(x - wd/2).toFixed(2)}" y="${TOP - 1}" width="${wd.toFixed(2)}" height="${(depth + 1).toFixed(2)}" fill="${field}"/>`;
        out += `<path d="M ${(x - wd/2).toFixed(2)} ${TOP} V ${(TOP + depth).toFixed(2)} H ${(x + wd/2).toFixed(2)} V ${TOP}" fill="none" stroke="${hot ? accent : ink}" stroke-width="1"/>`;
      } else if (isHollow) {
        const depth = (7 + 4 * mag) * arrive, wd = 4 + 2 * mag;
        out += `<path d="M ${(x - wd/2).toFixed(2)} ${TOP} V ${(TOP + depth).toFixed(2)} H ${(x + wd/2).toFixed(2)} V ${TOP}" fill="none" stroke="${hot ? accent : strong}" stroke-width="1" stroke-dasharray="1.5 1.5"/>`;
      } else {
        // the scale: hidden at rest, fades in with the pointer, magnifies under it
        const alpha = Math.min(1, scale) * (0.55 + 0.45 * mag);
        if (alpha > 0.01) { const h = 3.5 + 6 * mag; out += `<rect x="${(x - 0.5).toFixed(2)}" y="${TOP + 1}" width="1" height="${h.toFixed(2)}" fill="${nearestTick === i ? ink : rule}" opacity="${alpha.toFixed(2)}"/>`; }
      }
    });
    if (read.pair) { const [a,b] = read.pair; const y = TOP + 8 * arrive; const c = (pinned && target === 'pair') ? (accentSeal ? seal : ink) : ink;
      out += `<path d="M ${(xs[a]-2).toFixed(2)} ${(y+1).toFixed(2)} V ${(y+4).toFixed(2)} H ${(xs[b]+2).toFixed(2)} V ${(y+1).toFixed(2)}" fill="none" stroke="${c}" stroke-width="1" opacity="${arrive.toFixed(2)}"/>`; }
    svg.innerHTML = out;
    crown.dataset.pinned = pinned ? '1' : '';
    // readout
    if (nearestTick === null || curX === null) { readout.textContent = readout.dataset.rest; readout.classList.remove('cut'); }
    else if (target === 'pair') { readout.textContent = NAMES[read.pair[0]] + ' + ' + NAMES[read.pair[1]]; readout.classList.add('cut'); }
    else if (read.cut.includes(nearestTick)) { readout.textContent = NAMES[nearestTick]; readout.classList.add('cut'); }
    else if (read.hollow.includes(nearestTick)) { readout.textContent = NAMES[nearestTick] + ', not yet'; readout.classList.add('cut'); }
    else { readout.textContent = NAMES[nearestTick]; readout.classList.remove('cut'); }
    // note
    if (target === null) { pop.classList.remove('on'); return; }
    const n = (crown.dataset.read === 'prompt' ? NOTES2 : crown.dataset.read === 'fit' ? NOTES3 : NOTES)[target]; const t = targets.find(t => t.id === target);
    pop.style.setProperty('--ax', (t.x + 13) + 'px');
    const label = n.open ? `<b>${n.name}, not yet.</b>` : `<b>${n.name}.</b>`;
    pop.innerHTML = `<div class="kicker"><span>${label} ${n.meaning}</span><small>${pinned ? 'pinned' : ''}</small></div><p>${n.body}</p>${n.meta ? `<div class="meta"><em>Wrong if</em> ${n.meta}</div>` : ''}`;
    pop.classList.add('on');
  }
  function nearestOf(list, x) { let best = null, d = 1e9; list.forEach((t) => { const dd = Math.abs(t.x - x); if (dd < d) { d = dd; best = t; } }); return { best, d }; }
  function toLocalX(clientX) { const r = svg.getBoundingClientRect(); return (clientX - r.left) * (w / r.width); }
  function retarget() {
    if (pinned || curX === null) return;
    const all = xs.map((x, i) => ({ id: i, x }));
    nearestTick = nearestOf(all, curX).best.id;
    const { best, d } = nearestOf(targets, curX);
    // snap to a note target when within reach; the pair claims the span between its two notches
    if (best && best.id === 'pair' && read.pair && curX > xs[read.pair[0]] - 2 && curX < xs[read.pair[1]] + 2 && !read.cut.includes(nearestTick)) target = 'pair';
    else if (best && d < 6) target = best.id;
    else target = null;
  }
  // spring-ish easing loop
  let raf = null;
  function tick() {
    const wantScale = hoverX === null ? 0 : 1;
    scale += (wantScale - scale) * 0.18;
    if (hoverX !== null) curX = curX === null ? hoverX : curX + (hoverX - curX) * 0.35;
    if (hoverX === null && scale < 0.02) { scale = 0; curX = null; nearestTick = null; if (!pinned) target = null; }
    retarget(); draw();
    if (hoverX !== null || scale > 0 || arrive < 1) raf = requestAnimationFrame(tick); else raf = null;
  }
  const forced = crown.dataset.forced;
  if (forced) {
    // static record frame: pointer parked on the forced target
    scale = 1; const id = forced === 'pair' ? 'pair' : +forced;
    curX = id === 'pair' ? (xs[read.pair[0]] + xs[read.pair[1]]) / 2 : xs[id]; hoverX = curX; nearestTick = id === 'pair' ? read.pair[0] : id;
    if (id === 'pair' || read.cut.includes(id) || read.hollow.includes(id)) target = id; else target = null;
    draw(); return;
  }
  // arrival: cuts drop in, bracket draws
  arrive = 0; const t0 = performance.now();
  (function arriveTick(now) { const p = Math.min(1, (now - t0) / 520); arrive = 1 - Math.pow(1 - p, 3); draw(); if (p < 1) requestAnimationFrame(arriveTick); })(t0);
  if (!targets.length) return;
  const hot = crown; // whole crown is the hit region
  hot.addEventListener('mousemove', e => {
    if (e.target.closest('.pop')) return;
    if (e.target.closest('.sig')) { hoverX = read.pair ? (xs[read.pair[0]] + xs[read.pair[1]]) / 2 : hoverX; }
    else hoverX = toLocalX(e.clientX);
    if (!raf) raf = requestAnimationFrame(tick);
  });
  hot.addEventListener('mouseleave', () => { hoverX = null; if (!raf) raf = requestAnimationFrame(tick); });
  hot.addEventListener('click', e => { if (e.target.closest('.pop')) return; if (target === null && !pinned) return; pinned = !pinned; if (!pinned) { target = null; } draw(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { pinned = false; target = null; hoverX = null; draw(); }
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const order = targets.slice().sort((a,b) => a.x - b.x); let i = order.findIndex(t => t.id === target); i = e.key === 'ArrowRight' ? Math.min(order.length - 1, i + 1) : Math.max(0, i - 1); target = order[i].id; pinned = true; scale = 1; curX = order[i].x; nearestTick = target === 'pair' ? read.pair[0] : target; draw(); }
  });
});
"""
html = f'<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>D1, How it wins: the notched edge</title><style>{CSS}</style></head>\n<body>\n<h1>How it wins: the notched edge</h1>\n<p class="sub">Card-catalogue cards were sorted by notches cut along the edge. Here the Lens plate gets that edge: eighty faint ticks, one per strategy, in thirteen groups. The few a company is building along are cut as notches, one it could take is hollow, and one bracket joins the pair that makes it unusual. Under the edge, one plain sentence is the read. The strategy names only appear inside the notes. Real cards: Irregular and Vellum. The middle panel is live.</p>\n<div class="frames">\n'
for h, cap in main: html += f'<div class="frame"><div class="panel">{h}</div><p class="cap">{cap}</p></div>\n'
html += '</div>\n<h2>Prompt test: the same object, copy written by the writing standard (writer Sonnet 5, edit Sonnet 5, hostile editor DeepSeek v4-pro)</h2>\n<div class="frames">\n'
for h, cap in prompt_frames: html += f'<div class="frame"><div class="panel">{h}</div><p class="cap">{cap}</p></div>\n'
html += '</div>\n<h2>States, for the record (hand-written copy)</h2>\n<div class="frames">\n'
for h, cap in record: html += f'<div class="frame"><div class="panel">{h}</div><p class="cap">{cap}</p></div>\n'
html += f'</div>\n<script>{SCRIPT}</script>\n</body></html>\n'
open('d1.html','w').write(html)
print('ok')
