// Pass 4: fit the hostile-edited read to the panel's slots without deleting actor, mechanism, or evidence.
import { readFileSync, writeFileSync } from "node:fs";
import { createAnthropicClient, createTracedAnthropicMessage } from "@cold-start/llm";
const DIR = "docs/product/design/2026-08-18-moat-read-direction/prompt-test";
const STANDARD = readFileSync(`${DIR}/writing-standard.md`, "utf8");
const draft = readFileSync(`${DIR}/out-3-hostile.json`, "utf8");
const client = createAnthropicClient();
const FIT = `PASS 4: FIT TO THE SURFACE
The read below is finished reasoning. It will be shown in a narrow side panel: one sentence at rest, and short notes that open on hover. Rewrite it to these limits. Cut words, never the actor, the mechanism, or the evidence. Where a note repeats a certainty statement in several sentences, state it once, at the end, in five words or fewer (for example "Reported." "Inferred from two cases."). Do not add hedges the draft did not have. Keep the same JSON keys.
- "sentence": at most 100 characters. It states how this company wins today, in ordinary words, and should be readable without the notes.
- each "meaning": at most 12 words.
- each "building_along" note: at most 45 words, citations included.
- "pair" note: at most 70 words. "changes_if": at most 25 words.
- each "open_to" note: at most 35 words.
Return only the JSON.`;
async function main() {
  const res = await createTracedAnthropicMessage({ client, label: "pass4-fit", model: "claude-sonnet-5", stage: "synthesis" as any,
    params: { model: "claude-sonnet-5", max_tokens: 12000, system: STANDARD + "\n\n" + FIT, messages: [{ role: "user", content: draft }] } as any });
  const text = (res.content as any[]).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  const u: any = (res as any).usage; console.log(`[pass4-fit] in=${u.input_tokens} out=${u.output_tokens} thinking=${u.output_tokens_details?.thinking_tokens}`);
  writeFileSync(`${DIR}/out-4-fit.json`, text); console.log(text);
}
main().catch((e) => { console.error(e); process.exit(1); });
