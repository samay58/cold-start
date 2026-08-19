// Runs Samay's writing standard (2026-08-19) against Irregular's real card, three passes:
// 1 writer (reasoning), 2 editor (same model, fresh call, fits the UI slots), 3 hostile editor (other model).
// Usage: set -a; source .env.local; set +a; npx tsx docs/product/design/2026-08-18-moat-read-direction/prompt-test/run.ts
import { readFileSync, writeFileSync } from "node:fs";
import { createAnthropicClient, createTracedAnthropicMessage } from "@cold-start/llm";

const DIR = "docs/product/design/2026-08-18-moat-read-direction/prompt-test";
const card = readFileSync(`${DIR}/irregular-card.json`, "utf8");
const STANDARD = readFileSync(`${DIR}/writing-standard.md`, "utf8");
const EDITOR = readFileSync(`${DIR}/hostile-editor.md`, "utf8");
const STRATEGIES = readFileSync(`${DIR}/strategies.md`, "utf8");
const WRITER = process.env.WRITER_MODEL ?? "claude-sonnet-5";
const HOSTILE = process.env.HOSTILE_MODEL ?? "deepseek/deepseek-v4-pro";
const client = createAnthropicClient();

const TASK = `You are writing one read for Cold Start, an investor's side panel that shows a sourced profile of a startup. This read answers one question: how does this company win? Its vocabulary is a fixed list of 80 ways companies win (below). It is never a checklist. From the evidence, identify:
- the two to four ways this company is winning today, each tied to specific cited evidence [eN];
- which one pair among them is unusual for a company in its category, and what specifically makes that pair hard for a competitor to copy;
- zero to two ways it could take but has not, each with the condition that would have to hold;
- what would change the read.
If the evidence shows nothing unusual, say that instead of inventing a pattern. Only claim what the cited evidence supports, and say which statements are inference rather than observation. Cite with the ids from the card, like [e3].

The 80 ways, in 13 groups:
${STRATEGIES}

The company's card (facts, signals, citations with source snippets):
${card}`;

const SLOTS = `The finished read fills these slots in the panel. Every slot is complete, plain prose; the limits are the panel's, not a licence to compress the reasoning away.
- "sentence": what appears at rest under the label "How it wins". At most 100 characters. It must say, in ordinary words, how this company wins today. No metaphor, no label, no slogan.
- "building_along": two to four items {strategy, meaning, note}. "strategy" is the name from the list. "meaning" is one short plain sentence saying what that way of winning means in general. "note" is two to four sentences: what this company does that fits it, the evidence [eN], and whether that is observed or inferred.
- "pair": {strategies: [two names], note, changes_if}. "note" is up to five sentences: what the two are, why they hold together for this company, the mechanism that makes the pair hard to copy, the evidence, and what is inferred. "changes_if" is one sentence naming what would make the read wrong.
- "open_to": zero to two items {strategy, note}: a way it could take but has not, and the condition that would have to hold, two or three sentences.
- "status": "read" or "nothing_unusual". If nothing_unusual, "sentence" says so plainly for this company and the other slots are empty.
Return only JSON with those keys.`;

async function ask(model: string, system: string, user: string, label: string) {
  const res = await createTracedAnthropicMessage({
    client, label, model, stage: "synthesis" as any,
    params: { model, max_tokens: model.startsWith("claude") ? 16000 : 6000, system, messages: [{ role: "user", content: user }] } as any
  });
  const text = (res.content as any[]).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  const usage: any = (res as any).usage ?? {};
  console.log(`[${label}] ${model} in=${usage.input_tokens} out=${usage.output_tokens} thinking=${usage.output_tokens_details?.thinking_tokens} stop=${(res as any).stop_reason} blocks=${(res.content as any[]).map((b)=>b.type).join(",")}`);
  return text;
}

async function main() {
  const p1 = await ask(WRITER, STANDARD + `\n\nPASS 1: ESTABLISH THE REASONING\nDevelop the analysis fully before optimizing the prose. For each important conclusion, explicitly identify: the relevant actor, the action or product, the causal mechanism, the supporting evidence, the assumptions, the uncertainty, the practical implication. Do not attempt to sound elegant or concise during this pass. Write prose, not JSON.`, TASK, "pass1-writer");
  writeFileSync(`${DIR}/out-1-writer.md`, p1);

  const p2 = await ask(WRITER, STANDARD + `\n\nPASS 2: EDIT WITHOUT DELETING REASONING\nRewrite this draft into clear, natural prose. Remove repetition and unnecessary words, but preserve every important causal link, qualification, distinction, and piece of evidence. Do not replace explanation with slogans, metaphors, labels, or compressed strategic language. A shorter sentence is not better if it forces the reader to infer the mechanism.\n\n${SLOTS}`, `The draft:\n\n${p1}\n\nFor reference, the task and evidence the draft was written from:\n\n${TASK}`, "pass2-edit");
  writeFileSync(`${DIR}/out-2-edit.json`, p2);

  const p3 = await ask(HOSTILE, EDITOR + `\n\nThe draft is JSON that fills fixed slots in a product panel. Keep the same JSON keys and the same slot limits:\n${SLOTS}\nReturn only the revised JSON.`, `The draft:\n\n${p2}\n\nThe evidence the draft must stay within (do not add facts not in it):\n\n${card}`, "pass3-hostile");
  writeFileSync(`${DIR}/out-3-hostile.json`, p3);
  console.log("done");
}
main().catch((e) => { console.error(e); process.exit(1); });
