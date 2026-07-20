# Kimi K3 and judgment-stage routing verdict

Captured: 2026-07-20
Scope: eval verdict and routing recommendation. No production routing changed.

## What was tested

Kimi K3 (released 2026-07-16), wired through OpenRouter only, evaluated on the two judgment stages against the incumbent and both DeepSeek tiers. The provider-matrix harness gained `synthesis` (paired candidate + fixed `deepseek/deepseek-v4-flash` verify judge) and `research_section` (offline mirror of the production evidence builder) for this comparison; both stages are now permanent harness capabilities. Fixtures: 12 fresh production cards frozen 2026-07-20. Runs: `eval/provider-matrix/runs/2026-07-20T06-14-35-790Z` (extraction refresh) and `runs/2026-07-20T12-59-38-007Z` (judgment stages).

## Judgment-stage results

| Model | Stage | Parse ok | Median candidate cost | Median latency | Survival (med) | Empty rate |
|---|---|---:|---:|---:|---:|---:|
| claude-sonnet-4-6 | synthesis | 9/12 | $0.047 | 44s | 0.44 | 0% |
| deepseek-v4-flash | synthesis | 8/12 | $0.0016 | 23s | 0.50 | 0% |
| deepseek-v4-pro | synthesis | 10/12 | $0.0040 | 29s | 0.55 | 0% |
| kimi-k3 | synthesis | 8/12 | $0.136 | 295s | 0.70 | 0% |
| claude-sonnet-4-6 | research_section | 21/24 | $0.031 | 13s | - | 29% |
| deepseek-v4-flash | research_section | 22/24 | $0.0010 | 5s | - | 36% |
| deepseek-v4-pro | research_section | 21/24 | $0.0032 | 5s | - | 33% |
| kimi-k3 | research_section | 18/24 | $0.053 | 91s | - | 11% |

Citation violations and generic-phrase medians were 0.0 for every model on both stages.

## Findings

K3 is not a routing candidate for Cold Start today. Despite per-token price parity with Sonnet ($3/$15), mandatory always-max reasoning makes its realized synthesis cost about 3x Sonnet ($0.136 vs $0.047 median) at about 7x the latency (295s vs 44s). Extraction was ruled out live before the matrix: a single K3 extract_full attempt cannot finish inside a 6-minute timeout on a real evidence payload that DeepSeek flash completes in 23 seconds. The one place K3 looked strong: highest judge survival (0.70) and lowest section empty rate (11%) with zero citation violations, meaning it produced cited, non-empty content most often. That is worth revisiting only if hosted-weights pricing collapses: open weights are promised for 2026-07-27, and `fireworks`/`together` provider defaults are already wired if a cheap host appears.

DeepSeek v4-pro is the live candidate this exercise surfaced, exactly where the cost-quality playbook predicted: `research_section` at $0.0032 per call vs Sonnet's $0.031, with equal parse and empty rates and the best synthesis parse rate of the panel (10/12). The blind side-by-side read is the remaining gate before flipping `LLM_RESEARCH_SECTION_MODEL` in Vercel. Note pro's extraction arm showed two provider-side "terminated" failures; extraction stays on flash regardless.

Measurement caveats to carry. The fixed judge is flash, so survival comparisons carry a self-agreement bias in flash's favor and a literal-mindedness bias against bolder claims; the blind read is the corrective, not the survival column alone. Three oversized fixtures (substrate, superhuman, symphonyai; 36 to 57 stored sources) timed out across every model including Sonnet on the Anthropic path, so their failures say nothing about models: judgment-stage replays need an evidence budget the way extraction has one. Filed as harness follow-up.

Wiring facts learned live, all encoded as `quirksForModel` entries and covered by tests: Moonshot rejects a named forced tool_choice while thinking is enabled (downgraded to "required", equivalent because every stage call passes exactly one tool); the 8192 max_tokens floor truncates K3 mid-reasoning (floored at 32768); the adapter's 120s default timeout is far too small for K3 (matrix runs used `LLM_OPENAI_COMPAT_TIMEOUT_MS=900000`). OpenRouter's `usage.cost` now feeds cost telemetry directly, so the K3 dollar figures above are billed truth, not estimates.

## Next

1. Samay's blind read: `eval/provider-matrix/runs/2026-07-20T12-59-38-007Z/side-by-side.md` first, `answer-key.json` after. The decision it gates is the pro flip on research sections, not K3.
2. If the read clears: set `LLM_RESEARCH_SECTION_MODEL=deepseek/deepseek-v4-pro` in Vercel, redeploy, judge a known company's sections, billing page as ground truth. Rollback is unsetting the var.
3. 2026-07-27: check K3 open-weight hosting prices before re-running the K3 arms.
4. Harness follow-up: evidence budget for judgment-stage replays so mega-fixtures stop timing out symmetrically.

## Community reception addendum (2026-07-20, day 4 post-launch)

A 210-item social sweep (Reddit, X, HN, YouTube, TikTok, Polymarket; raw file `~/Documents/Last30Days/kimi-k3-launch-reception-raw-v3.md`, packaged workbook `~/Documents/Last30Days/kimi-k3-reception-pack-2026-07-20.xlsx`) reconciles the launch hype with this verdict. The hype is measuring capability and openness; this verdict measures cost per unit of pipeline work. Both hold.

What the sweep established, beyond the day-one research:

- Demand is real enough that Moonshot paused new subscriptions on 2026-07-19 to protect compute for existing users. The HN launch thread hit 2,086 points and 1,204 comments.
- The community independently corroborates our timeout data: users in the pause thread report OpenRouter latency of 11s and 16 tok/s, called "abysmal". Our matrix's K3 failures were oversubscription plus slowness, not wiring.
- Benchmark credibility went UP under scrutiny: Moonshot claimed 67.5% on DeepSWE, and DeepSWE's independent run confirmed 69%.
- Markets treated launch day as a second DeepSeek moment (Taiwan -6%, Nasdaq -1.5%) and recovered by midday for the same reason this verdict rejects K3: it is premium-priced, not a cost disruption.
- Polymarket prices the July 27 open-weights release at 95%. That release is the standing re-check trigger: third-party hosts (fireworks/together, already wired) may collapse the per-token price, though the verbosity tax (roughly 2x median output tokens per Artificial Analysis, which spent $2,709.75 evaluating it) survives any host.
- The rejection is of K3's economics, not its intelligence: its top-4 AA Intelligence rank and our own survival/empty-rate wins are consistent with the community's read.
