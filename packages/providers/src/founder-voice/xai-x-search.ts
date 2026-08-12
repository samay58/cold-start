import { capText } from "./types";
import type { FounderVoiceItem, FounderVoiceLaneResult, FounderVoiceTargets } from "./types";

/*
 * xAI x_search is a server-side tool attached to a grok call, not a model of its own.
 * This module is the ONLY place that knows the xAI wire shape; swap providers here,
 * never in callers. xAI's search surface already churned once in 2026.
 *
 * Wire shape verified live on 2026-08-12 against a real call to api.x.ai (key redacted;
 * see task-4-report.md for the full probe record). Findings that differ from the brief's
 * original assumption (a chat-completions tool block):
 *
 * - The tool only works on POST https://api.x.ai/v1/responses (the "Responses API"), NOT
 *   on /v1/chat/completions. That endpoint rejects {"type":"x_search"} outright with a
 *   structural 422: "unknown variant `x_search`, expected `function` or `live_search`".
 * - Request body: {model, max_output_tokens, input:[{role:"user",content:string}],
 *   tools:[{type:"x_search", allowed_x_handles:string[], from_date:"YYYY-MM-DD"}]}.
 *   The tool's config fields sit directly on the tool object, not nested under an
 *   "x_search" key as the docs' own OpenAI-Responses-API example shows.
 * - tool_choice cannot force the tool: passing {"type":"x_search"} 422s with "data did
 *   not match any variant of untagged enum ModelToolChoice". Only the default "auto" (by
 *   omission) works.
 * - allowed_x_handles alone does NOT reliably restrict the model's own search queries: a
 *   prompt that named handles only in the tool config (never in the prompt text) made the
 *   model search unrelated celebrity accounts (elonmusk, sama, tim_cook...) across 24
 *   x_search sub-calls before giving up with an empty array, at roughly $0.13. Naming
 *   every handle explicitly in the prompt text fixed this outright (6 sub-calls, correct
 *   handle, ~$0.04). The prompt built below always spells out every handle by name.
 * - Response body: {output: [...]}. `output` interleaves tool-call and reasoning entries
 *   with one final {type:"message", role:"assistant", content:[{type:"output_text",
 *   text}]} entry; the JSON post array lives in that last entry's text, which may or may
 *   not be wrapped in prose or a code fence.
 */
const XAI_RESPONSES_URL = "https://api.x.ai/v1/responses";
const XAI_XSEARCH_MODEL = process.env.XAI_XSEARCH_MODEL ?? "grok-4.20-non-reasoning-latest";
const XAI_MAX_HANDLES = 20;
const MAX_OUTPUT_TOKENS = 1500;
export const XAI_XSEARCH_EST_COST_USD = 0.05;

const LANE = "xai_x_search" as const;

type XaiOutputContentItem = {
  type?: string;
  text?: string;
};

type XaiOutputItem = {
  type?: string;
  role?: string;
  content?: XaiOutputContentItem[];
};

type XaiResponsesPayload = {
  output?: XaiOutputItem[];
};

type XaiPost = {
  handle?: string;
  date?: string;
  url?: string;
  text?: string;
};

type FounderHandle = { handle: string; founderName: string };

export async function fetchXaiXSearchLane(input: {
  targets: FounderVoiceTargets;
  xaiApiKey?: string;
  timeoutMs: number;
  fetchFn?: typeof fetch;
}): Promise<FounderVoiceLaneResult> {
  const fetchFn = input.fetchFn ?? fetch;

  try {
    const handleEntries = handlesFromFounders(input.targets.founders);
    if (!input.xaiApiKey || handleEntries.length === 0) {
      return { lane: LANE, items: [], estimatedCostUsd: 0 };
    }

    const cappedHandles = handleEntries.slice(0, XAI_MAX_HANDLES);
    const response = await fetchFn(XAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.xaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: XAI_XSEARCH_MODEL,
        max_output_tokens: MAX_OUTPUT_TOKENS,
        input: [{ role: "user", content: xaiPrompt(input.targets.companyName, cappedHandles) }],
        tools: [
          {
            type: "x_search",
            allowed_x_handles: cappedHandles.map((entry) => entry.handle),
            from_date: twelveMonthsAgoDate(),
          },
        ],
      }),
      signal: AbortSignal.timeout(input.timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`xAI x_search request failed with ${response.status}`);
    }

    const payload = (await response.json()) as XaiResponsesPayload;
    const text = assistantTextFromOutput(payload.output ?? []);
    const posts = parseXaiPosts(text);

    const handleToFounder = new Map(cappedHandles.map((entry) => [normalizeHandle(entry.handle), entry.founderName]));
    const items = itemsFromPosts(posts, handleToFounder);

    return { lane: LANE, items, estimatedCostUsd: XAI_XSEARCH_EST_COST_USD };
  } catch (error) {
    return { lane: LANE, items: [], estimatedCostUsd: 0, failure: error instanceof Error ? error.message : String(error) };
  }
}

function itemsFromPosts(posts: XaiPost[], handleToFounder: Map<string, string>): FounderVoiceItem[] {
  const items: FounderVoiceItem[] = [];

  for (const post of posts) {
    const url = typeof post.url === "string" ? post.url.trim() : "";
    const rawText = typeof post.text === "string" ? post.text.trim() : "";
    if (!url || !rawText) {
      continue;
    }

    const text = capText(rawText);
    const authorName = post.handle ? handleToFounder.get(normalizeHandle(post.handle)) : undefined;

    items.push({
      lane: LANE,
      url,
      title: capText(text.split("\n")[0] ?? text),
      text,
      // The card only ever carries a founder xUrl, never a company-level X handle, so a
      // returned post can only be attributed to a founder today. Revisit if a company
      // handle becomes derivable.
      authorship: "founder",
      ...(authorName ? { authorName } : {}),
      ...(post.date ? { publishedAt: post.date } : {}),
    });
  }

  return items;
}

function handlesFromFounders(founders: FounderVoiceTargets["founders"]): FounderHandle[] {
  const seen = new Set<string>();
  const entries: FounderHandle[] = [];

  for (const founder of founders) {
    const handle = xHandleFromUrl(founder.xUrl);
    if (!handle || seen.has(handle.toLowerCase())) {
      continue;
    }
    seen.add(handle.toLowerCase());
    entries.push({ handle, founderName: founder.name });
  }

  return entries;
}

function xHandleFromUrl(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    if (host !== "x.com" && host !== "twitter.com") {
      return null;
    }
    const segment = parsed.pathname.split("/").filter(Boolean)[0];
    return segment && segment.length > 0 ? segment : null;
  } catch {
    return null;
  }
}

function xaiPrompt(companyName: string, handleEntries: FounderHandle[]): string {
  const handleList = handleEntries.map((entry) => `@${entry.handle} (${entry.founderName})`).join(", ");
  return (
    `Search only these X/Twitter handles: ${handleList}. They are people at the company ${companyName}. ` +
    `Return a strict JSON array (no prose, no markdown fence) of up to 5 recent posts total by these ` +
    `handles about their work at ${companyName}. Each item: {"handle":string,"date":string,"url":string,"text":string}. ` +
    `If none are found, return [].`
  );
}

function twelveMonthsAgoDate(): string {
  const now = new Date();
  const past = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 12, now.getUTCDate()));
  return past.toISOString().slice(0, 10);
}

function assistantTextFromOutput(output: XaiOutputItem[]): string {
  const messages = output.filter((item) => item.type === "message" && item.role === "assistant");
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage?.content) {
    return "";
  }
  return lastMessage.content
    .filter((part) => part.type === "output_text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n");
}

// Same strategy as the verifier's stripJsonFence in packages/llm/src/verifier.ts: ignore
// fences and any chatty prose, slice from the first [ to the last ], then parse that.
function parseXaiPosts(text: string): XaiPost[] {
  const trimmed = text.trim();
  const firstBracket = trimmed.indexOf("[");
  if (firstBracket === -1) {
    throw new Error("xAI x_search response did not contain a JSON array");
  }
  const lastBracket = trimmed.lastIndexOf("]");
  if (lastBracket <= firstBracket) {
    throw new Error("xAI x_search response did not contain a closed JSON array");
  }
  const sliced = trimmed.slice(firstBracket, lastBracket + 1);
  const parsed: unknown = JSON.parse(sliced);
  if (!Array.isArray(parsed)) {
    throw new Error("xAI x_search response JSON was not an array");
  }
  return parsed as XaiPost[];
}

function normalizeHandle(value: string): string {
  return value.replace(/^@/, "").trim().toLowerCase();
}
