/*
 * The "How it wins" read: four passes over one card. Pass 1 reasons in prose under the writing
 * standard, pass 2 fits that reasoning to the panel's slots as JSON, pass 3 is a second model
 * reading the draft as a hostile editor, pass 4 trims the result to the surface. Pass 3 is
 * optional by design: when it fails for any reason other than transport, the draft it was given
 * goes on to pass 4 unchanged.
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { Message } from "@anthropic-ai/sdk/resources/messages";
import {
  HOW_IT_WINS_GROUPS,
  howItWinsSchema,
  howItWinsStrategyIdForName,
  type ColdStartCard,
  type HowItWins,
  type HowItWinsStrategyId
} from "@cold-start/core";
import { anthropicSystemCacheControl, createTracedAnthropicMessage, type AnthropicTelemetrySink } from "./anthropic";
import { withProviderFallback } from "./llm-provider";
import {
  HOW_IT_WINS_HOSTILE_EDITOR,
  HOW_IT_WINS_PASS_1,
  HOW_IT_WINS_PASS_2,
  HOW_IT_WINS_PASS_3_FRAME,
  HOW_IT_WINS_PASS_4,
  HOW_IT_WINS_SLOTS,
  HOW_IT_WINS_TASK_INTRO,
  HOW_IT_WINS_WRITING_STANDARD
} from "./how-it-wins-prompts";
import { visibleCitationMarkers } from "./tool-schema-fragments";
import { isTransientLlmError } from "./transient-error";

export const HOW_IT_WINS_DEFAULT_EDITOR_MODEL = "deepseek/deepseek-v4-pro";

export type HowItWinsModels = { writer: string; editor: string };
export type HowItWinsPassName = "reason" | "edit" | "editor" | "fit";
export type HowItWinsResult = {
  read: HowItWins;
  editorSkipped: boolean;
  fitRetried: boolean;
  styleIssues: string[];
};

const REASON_MAX_TOKENS = 16000;
const EDIT_MAX_TOKENS = 16000;
const EDITOR_MAX_TOKENS = 8000;
const FIT_MAX_TOKENS = 16000;
// A response with no text block is almost always reasoning that ran out of budget before the
// answer started, so the one retry buys room rather than changing the ask.
const EMPTY_TEXT_RETRY_MAX_TOKENS = 24000;

const EM_DASH = "\u2014";
const CERTAINTY_PATTERN = /\b(inferred|inference|reported|observed)\b/gi;
const CODE_FENCE_PATTERN = /```(?:json)?\s*([\s\S]*?)```/;

export class HowItWinsEmptyTextError extends Error {
  constructor(message = "the how-it-wins model returned no text block") {
    super(message);
    this.name = "HowItWinsEmptyTextError";
  }
}

export function textFromMessage(message: Message): string {
  const text = message.content
    .filter((block): block is Extract<Message["content"][number], { type: "text" }> => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  if (!text) {
    throw new HowItWinsEmptyTextError();
  }

  return text;
}

export function cardForHowItWinsPrompt(card: ColdStartCard): Omit<ColdStartCard, "synthesis" | "synthesisWithheld"> {
  const { synthesis, synthesisWithheld, ...rest } = card;
  return rest;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function wordCount(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

// The model is asked for JSON and only JSON, but a fence or a sentence of preamble is the common
// slip. Try the whole response, then a fenced block, then the outermost braces.
function parseDraftJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = CODE_FENCE_PATTERN.exec(trimmed)?.[1]?.trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  const braced = firstBrace >= 0 && lastBrace > firstBrace ? trimmed.slice(firstBrace, lastBrace + 1) : undefined;

  for (const candidate of [trimmed, fenced, braced]) {
    if (!candidate) {
      continue;
    }
    try {
      return JSON.parse(candidate);
    } catch {
      continue;
    }
  }

  return undefined;
}

function citationIdsFromNote(note: unknown): string[] {
  if (typeof note !== "string") {
    return [];
  }
  return Array.from(new Set(visibleCitationMarkers(note)));
}

function strategyIdFor(name: unknown, path: string, issues: string[]): HowItWinsStrategyId | null {
  if (typeof name !== "string") {
    issues.push(`${path} has no strategy name`);
    return null;
  }

  const id = howItWinsStrategyIdForName(name);
  if (!id) {
    issues.push(`${path} is not one of the 80 ways: "${name}"`);
  }
  return id;
}

function citationIdsOf(read: HowItWins): string[] {
  if (read.status !== "read") {
    return [];
  }

  return [
    ...read.running.flatMap((entry) => entry.citationIds),
    ...(read.pair ? read.pair.citationIds : []),
    ...read.next.flatMap((entry) => entry.citationIds)
  ];
}

export function parseHowItWinsDraft(text: string, card: ColdStartCard): { read: HowItWins } | { issues: string[] } {
  const raw = parseDraftJson(text);
  if (!isRecord(raw)) {
    return { issues: ["the draft was not JSON"] };
  }

  if (raw.status === "nothing_stands_out") {
    const sentence = typeof raw.sentence === "string" && raw.sentence.trim().length > 0 ? raw.sentence : undefined;
    return { read: sentence ? { status: "nothing_stands_out", sentence } : { status: "nothing_stands_out" } };
  }

  const issues: string[] = [];
  const running = asArray(raw.running).map((entry, index) => {
    const item = isRecord(entry) ? entry : {};
    return {
      strategy: strategyIdFor(item.strategy, `running[${index}].strategy`, issues),
      meaning: item.meaning,
      note: item.note,
      citationIds: citationIdsFromNote(item.note)
    };
  });

  const pairRaw = isRecord(raw.pair) ? raw.pair : null;
  const pair = pairRaw
    ? {
        strategies: asArray(pairRaw.strategies).map((name, index) =>
          strategyIdFor(name, `pair.strategies[${index}]`, issues)
        ),
        note: pairRaw.note,
        wrongIf: pairRaw.wrong_if ?? pairRaw.wrongIf,
        citationIds: citationIdsFromNote(pairRaw.note)
      }
    : null;

  const next = asArray(raw.next).map((entry, index) => {
    const item = isRecord(entry) ? entry : {};
    return {
      strategy: strategyIdFor(item.strategy, `next[${index}].strategy`, issues),
      note: item.note,
      citationIds: citationIdsFromNote(item.note)
    };
  });

  if (issues.length > 0) {
    return { issues };
  }

  const parsed = howItWinsSchema.safeParse({
    status: "read",
    sentence: raw.sentence,
    running,
    pair,
    next,
    wrongIf: raw.wrong_if ?? raw.wrongIf
  });

  if (!parsed.success) {
    return { issues: parsed.error.issues.map((issue) => `${issue.path.join(".") || "read"}: ${issue.message}`) };
  }

  const onCard = new Set(card.citations.map((citation) => citation.id));
  const missing = Array.from(new Set(citationIdsOf(parsed.data).filter((id) => !onCard.has(id))));
  if (missing.length > 0) {
    return { issues: [`cited ids that are not on the card: ${missing.join(", ")}`] };
  }

  return { read: parsed.data };
}

export function styleIssuesForRead(read: HowItWins): string[] {
  const issues: string[] = [];

  const checkEmDash = (value: string, path: string) => {
    if (value.includes(EM_DASH)) {
      issues.push(`${path} contains an em dash; use a period or a semicolon`);
    }
  };
  const checkSentence = (value: string, path: string) => {
    if (wordCount(value) < 6 || !value.trimEnd().endsWith(".")) {
      issues.push(`${path} is not one complete plain sentence: "${value}"`);
    }
  };
  const checkNote = (value: string, path: string) => {
    checkEmDash(value, path);
    if ((value.match(CERTAINTY_PATTERN) ?? []).length >= 3) {
      issues.push(`${path} states certainty more than once; state it once, at the end`);
    }
  };

  if (read.status !== "read") {
    if (read.status === "nothing_stands_out" && read.sentence) {
      checkEmDash(read.sentence, "sentence");
      checkSentence(read.sentence, "sentence");
    }
    return issues;
  }

  checkEmDash(read.sentence, "sentence");
  checkSentence(read.sentence, "sentence");
  checkEmDash(read.wrongIf, "wrongIf");

  read.running.forEach((entry, index) => {
    checkEmDash(entry.meaning, `running[${index}].meaning`);
    if (!/^[A-Z].*[.]$/.test(entry.meaning.trim()) || wordCount(entry.meaning) < 5) {
      issues.push(`running[${index}].meaning is a fragment: "${entry.meaning}"`);
    }
    checkNote(entry.note, `running[${index}].note`);
  });

  if (read.pair) {
    checkNote(read.pair.note, "pair.note");
    checkEmDash(read.pair.wrongIf, "pair.wrongIf");
  }

  read.next.forEach((entry, index) => checkNote(entry.note, `next[${index}].note`));

  return issues;
}

function withoutEmDashes(value: string): string {
  return value.replace(/\s*\u2014\s*/g, "; ");
}

function stripEmDashes(read: HowItWins): HowItWins {
  if (read.status !== "read") {
    return read.status === "nothing_stands_out" && read.sentence
      ? { status: "nothing_stands_out", sentence: withoutEmDashes(read.sentence) }
      : read;
  }

  return {
    ...read,
    sentence: withoutEmDashes(read.sentence),
    wrongIf: withoutEmDashes(read.wrongIf),
    running: read.running.map((entry) => ({
      ...entry,
      meaning: withoutEmDashes(entry.meaning),
      note: withoutEmDashes(entry.note)
    })),
    pair: read.pair
      ? { ...read.pair, note: withoutEmDashes(read.pair.note), wrongIf: withoutEmDashes(read.pair.wrongIf) }
      : null,
    next: read.next.map((entry) => ({ ...entry, note: withoutEmDashes(entry.note) }))
  };
}

type PassCall = {
  client: Anthropic;
  label: string;
  maxTokens: number;
  model: string;
  system: string;
  telemetry?: AnthropicTelemetrySink | undefined;
  user: string;
};

async function callOnce(call: PassCall, maxTokens: number): Promise<string> {
  const message = await createTracedAnthropicMessage({
    client: call.client,
    label: call.label,
    model: call.model,
    stage: "how_it_wins",
    telemetry: call.telemetry,
    params: {
      model: call.model,
      max_tokens: maxTokens,
      temperature: 0.2,
      system: [{ type: "text", text: call.system, cache_control: anthropicSystemCacheControl() }],
      messages: [{ role: "user", content: call.user }]
    }
  });

  return textFromMessage(message);
}

async function callWithEmptyTextRetry(call: PassCall): Promise<string> {
  try {
    return await callOnce(call, call.maxTokens);
  } catch (error) {
    if (!(error instanceof HowItWinsEmptyTextError)) {
      throw error;
    }
    return callOnce(call, EMPTY_TEXT_RETRY_MAX_TOKENS);
  }
}

function vocabularyForPrompt(): string {
  return HOW_IT_WINS_GROUPS.map(
    (group) => `${group.name}: ${group.strategies.map((strategy) => `${strategy.name} (${strategy.meaning})`).join("; ")}`
  ).join("\n");
}

export async function synthesizeHowItWins(input: {
  client: Anthropic;
  models: HowItWinsModels;
  card: ColdStartCard;
  telemetry?: AnthropicTelemetrySink;
}): Promise<HowItWinsResult> {
  const { client, models, card, telemetry } = input;
  const cardJson = JSON.stringify(cardForHowItWinsPrompt(card));
  const task = `${HOW_IT_WINS_TASK_INTRO}\n\nThe 80 ways, in 13 groups:\n${vocabularyForPrompt()}\n\nThe company's card (facts, signals, citations with source snippets):\n${cardJson}`;

  const askWriter = (pass: HowItWinsPassName, system: string, user: string, maxTokens: number) =>
    withProviderFallback("how_it_wins", models.writer, (model) =>
      callWithEmptyTextRetry({ client, telemetry, label: `how-it-wins-${pass}`, model, system, user, maxTokens })
    );

  const reasoning = await askWriter(
    "reason",
    `${HOW_IT_WINS_WRITING_STANDARD}\n\n${HOW_IT_WINS_PASS_1}`,
    task,
    REASON_MAX_TOKENS
  );

  const edited = await askWriter(
    "edit",
    `${HOW_IT_WINS_WRITING_STANDARD}\n\n${HOW_IT_WINS_PASS_2}\n\n${HOW_IT_WINS_SLOTS}`,
    `The draft:\n\n${reasoning}\n\nFor reference, the task and evidence the draft was written from:\n\n${task}`,
    EDIT_MAX_TOKENS
  );

  let hostile = edited;
  let editorSkipped = false;
  try {
    hostile = await callWithEmptyTextRetry({
      client,
      telemetry,
      label: "how-it-wins-editor",
      model: models.editor,
      system: `${HOW_IT_WINS_HOSTILE_EDITOR}\n\n${HOW_IT_WINS_PASS_3_FRAME}\n${HOW_IT_WINS_SLOTS}\nReturn only the revised JSON.`,
      user: `The draft:\n\n${edited}\n\nThe evidence the draft must stay within (do not add facts not in it):\n\n${cardJson}`,
      maxTokens: EDITOR_MAX_TOKENS
    });
  } catch (error) {
    if (isTransientLlmError(error)) {
      throw error;
    }
    editorSkipped = true;
  }

  const fitSystem = `${HOW_IT_WINS_WRITING_STANDARD}\n\n${HOW_IT_WINS_PASS_4}`;
  let parsed = parseHowItWinsDraft(await askWriter("fit", fitSystem, hostile, FIT_MAX_TOKENS), card);
  let styleIssues = "read" in parsed ? styleIssuesForRead(parsed.read) : [];
  let fitRetried = false;

  if ("issues" in parsed || styleIssues.length > 0) {
    const issues = "issues" in parsed ? parsed.issues : styleIssues;
    const retry = await askWriter(
      "fit",
      fitSystem,
      `${hostile}\n\nThe previous attempt had these problems; fix them and return only the JSON:\n- ${issues.join("\n- ")}`,
      FIT_MAX_TOKENS
    );
    fitRetried = true;
    parsed = parseHowItWinsDraft(retry, card);
    styleIssues = "read" in parsed ? styleIssuesForRead(parsed.read) : [];
  }

  if ("issues" in parsed) {
    throw new Error(`how-it-wins draft invalid: ${parsed.issues.join("; ")}`);
  }

  return { read: stripEmDashes(parsed.read), editorSkipped, fitRetried, styleIssues };
}
