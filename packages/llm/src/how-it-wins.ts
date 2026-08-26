/*
 * The "How it wins" read: four passes over one card. Pass 1 reasons in prose under the writing
 * standard, pass 2 fits that reasoning to the panel's slots as JSON, pass 3 is a second model
 * reading the draft as a hostile editor, pass 4 trims the result to the surface. Pass 3 is
 * optional by design: when it fails for any reason at all, the draft it was given goes on to
 * pass 4 unchanged.
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { Message } from "@anthropic-ai/sdk/resources/messages";
import {
  HOW_IT_WINS_GROUPS,
  howItWinsSchema,
  howItWinsStrategyById,
  howItWinsStrategyIdForName,
  type ColdStartCard,
  type HowItWins,
  type HowItWinsJudgment,
  type HowItWinsStrategyId
} from "@cold-start/core";
import { anthropicSystemCacheControl, createTracedAnthropicMessage, type AnthropicTelemetrySink } from "./anthropic";
import { parseModelString, withProviderFallback } from "./llm-provider";
import {
  frozenHowItWinsWriterRequest,
  howItWinsFromFrozenWriter,
  parseFrozenHowItWinsWriterDraft,
  parseHowItWinsJson
} from "./how-it-wins-frozen-writer";
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
import type { z } from "zod";

export const HOW_IT_WINS_DEFAULT_EDITOR_MODEL = "deepseek/deepseek-v4-pro";

// Three models, not two. The judge slot used to be the writer slot: the same model that renders
// the read also ran the all-80 audit, so neither could be routed without moving the other.
export type HowItWinsModels = { judge: string; writer: string; editor: string };
export type HowItWinsPassName = "reason" | "edit" | "editor" | "fit";
export type HowItWinsResult = {
  read: HowItWins;
  editorSkipped: boolean;
  fitRetried: boolean;
  styleIssues: string[];
  // Slips the parser corrected instead of failing on: a repeated running way, a next way that is
  // already running or outside the vocabulary, a pair leg spelled as a running way. Not failures.
  normalizations: string[];
  judgment?: HowItWinsJudgment;
};

const REASON_MAX_TOKENS = 16000;
const EDIT_MAX_TOKENS = 16000;
const EDITOR_MAX_TOKENS = 8000;
const FIT_MAX_TOKENS = 16000;
// A response with no text block is almost always reasoning that ran out of budget before the
// answer started, so the second attempt buys room rather than changing the ask. It cannot buy much:
// the SDK refuses a non-streaming call whose max_tokens implies over ten minutes at 128k tokens per
// hour (calculateNonstreamingTimeout in @anthropic-ai/sdk/client.js), which caps us at 21333.
const EMPTY_TEXT_RETRY_MAX_TOKENS = 21000;
// Third attempt: room did not help, so stop paying for reasoning and ask for the answer itself.
const THINKING_DISABLED_MAX_TOKENS = 16000;

const EM_DASH = "\u2014";
const CERTAINTY_PATTERN = /\b(inferred|inference|reported|observed)\b/gi;
const CLOSING_CERTAINTY_TAG_PATTERN = /(?:^|[.!?]\s+)(?:(?:the\s+)?(?:claim|mechanism|conclusion)\s+is\s+)?(?:observed(?:\s+fact)?|reported|inferred(?:\s+from\s+[^.]*)?)\.\s*$/i;
const COMMA_MARKER_LIST_PATTERN = /\[([A-Za-z0-9_-]+(?:\s*,\s*[A-Za-z0-9_-]+)+)\]/g;
// The four the hostile editor already caught, plus the seven the frozen writer prompt bans by
// name. Every one is a formula the writer reaches for instead of saying what the source said.
const BANNED_OUTPUT_PHRASES = [
  "the read would weaken",
  "would weaken if",
  "is observed fact",
  "on the card",
  "what is unresolved is whether",
  "would settle it",
  "would resolve it",
  "the record",
  "the evidence shows",
  "bears this out",
  "is consistent with"
] as const;
// The prompt asks for one sentence under 40 words and at most four handles a note. The checks sit
// a little wider than the ask so a good sentence at 41 words is not re-asked for its own sake.
const SENTENCE_MAX_WORDS = 45;
const NOTE_MAX_CITATION_MARKERS = 4;

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
// slip. Try the whole response, then a fenced block, then the outermost braces. The first parser
// error is kept so the re-ask can quote it back.
function parseDraftJson(text: string): { value: unknown } | { error: string } {
  return parseHowItWinsJson(text);
}

// Models write [e1, e2] often enough that a strict one-id-per-bracket reader loses the whole
// note's evidence. Expanded only for the marker derivation; the stored note keeps its own text.
function expandedMarkerLists(note: string): string {
  return note.replace(COMMA_MARKER_LIST_PATTERN, (_match, ids: string) =>
    ids
      .split(",")
      .map((id) => `[${id.trim()}]`)
      .join("")
  );
}

function citationIdsFromNote(note: unknown): string[] {
  if (typeof note !== "string") {
    return [];
  }
  return Array.from(new Set(visibleCitationMarkers(expandedMarkerLists(note))));
}

function strategyNameOf(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function citationIdsOf(read: HowItWins): string[] {
  if (read.status === "thin_file") {
    return [];
  }
  const inQuestion = read.inQuestion.flatMap((entry) => entry.citationIds);
  if (read.status !== "read") {
    return inQuestion;
  }

  return [
    ...read.running.flatMap((entry) => entry.citationIds),
    ...(read.pair ? read.pair.citationIds : []),
    ...read.next.flatMap((entry) => entry.citationIds),
    ...inQuestion
  ];
}

// The model never sees the derived schema, so a zod path means nothing to it. Every failure is
// restated in the slot names and the vocabulary the prompt actually gave it.
function issueSentence(issue: z.ZodIssue, runningNames: string[]): string {
  const [head, second, third] = issue.path;

  if (head === "sentence") {
    return "the sentence slot needs one plain sentence saying how this company wins today";
  }
  if (head === "wrongIf") {
    return "wrong_if needs one plain conditional about the world that would make the conclusion wrong";
  }
  if (head === "running") {
    if (typeof second !== "number") {
      return "the read needs one to six running ways, each with a strategy name, a meaning, and a note";
    }
    const label = `running item ${second + 1} ("${runningNames[second] ?? "unnamed"}")`;
    if (third === "citationIds") {
      return `${label} has no citation ids in square brackets in its note; cite at least one supplied id, like [e3]`;
    }
    if (third === "note") {
      return `${label} needs a note in plain prose, with the citation ids it rests on`;
    }
    return `${label} does not name one of the 80 ways; use a name from the list exactly as written`;
  }
  if (head === "pair") {
    if (second === "note") {
      return "the pair needs a note in plain prose, with the citation ids it rests on";
    }
    if (second === "wrongIf") {
      return "the pair needs a wrong_if conditional about the world that would make the pair wrong";
    }
    if (second === "citationIds") {
      return "the pair note has no citation ids in square brackets; cite at least one supplied id, like [e3]";
    }
    return "the pair must name two of the running strategies, or be null";
  }
  if (head === "next") {
    return "each next item needs a strategy name from the list and a note, and there may be at most two";
  }

  return 'the JSON must hold the keys status, sentence, running, pair, next, and wrong_if';
}

export type HowItWinsParse = { read: HowItWins; normalizations: string[] } | { issues: string[] };

export function parseHowItWinsDraft(text: string, card: ColdStartCard): HowItWinsParse {
  const draft = parseDraftJson(text);
  if ("error" in draft) {
    return { issues: [`the JSON could not be parsed: ${draft.error.slice(0, 120)}`] };
  }
  const raw = draft.value;
  if (!isRecord(raw)) {
    return { issues: ["the JSON could not be parsed: the draft was not a JSON object"] };
  }

  if (raw.status === "nothing_stands_out") {
    const sentence = typeof raw.sentence === "string" && raw.sentence.trim().length > 0 ? raw.sentence : undefined;
    return {
      read: sentence
        ? { status: "nothing_stands_out", sentence, inQuestion: [] }
        : { status: "nothing_stands_out", inQuestion: [] },
      normalizations: []
    };
  }
  if (raw.status !== "read") {
    return { issues: ['status must be "read" or "nothing_stands_out"'] };
  }

  const issues: string[] = [];
  const normalizations: string[] = [];

  const drafted = asArray(raw.running).map((entry, index) => {
    const item = isRecord(entry) ? entry : {};
    const name = strategyNameOf(item.strategy);
    const id = name ? howItWinsStrategyIdForName(name) : null;
    if (!name) {
      issues.push(`running item ${index + 1} has no strategy name; use a name from the list exactly as written`);
    } else if (!id) {
      issues.push(`"${name}" is not one of the 80 ways; use a name from the list exactly as written`);
    }
    return { id, name, note: item.note, citationIds: citationIdsFromNote(item.note) };
  });

  // A repeated way is a drafting slip, not a broken read; the first mention keeps its note.
  const running: typeof drafted = [];
  for (const entry of drafted) {
    if (entry.id && running.some((kept) => kept.id === entry.id)) {
      normalizations.push(`dropped a repeated running way: "${entry.name}"`);
      continue;
    }
    running.push(entry);
  }

  const runningIds = new Set(running.map((entry) => entry.id).filter((id): id is HowItWinsStrategyId => id !== null));

  const pairRaw = isRecord(raw.pair) ? raw.pair : null;
  const pair = pairRaw
    ? {
        strategies: asArray(pairRaw.strategies).map((value) => {
          const name = strategyNameOf(value);
          const mapped = name ? howItWinsStrategyIdForName(name) : null;
          if (mapped && runningIds.has(mapped)) {
            return mapped;
          }
          // The pair names a running way by a spelling the vocabulary map missed.
          const sameName = running.find((entry) => entry.id && entry.name.toLowerCase() === name.toLowerCase());
          if (sameName?.id) {
            normalizations.push(`read the pair leg "${name}" as the running way "${sameName.name}"`);
            return sameName.id;
          }
          return mapped;
        }),
        note: pairRaw.note,
        wrongIf: pairRaw.wrong_if ?? pairRaw.wrongIf,
        citationIds: citationIdsFromNote(pairRaw.note)
      }
    : null;

  // next is inference about what the company could still take. A name outside the vocabulary, or
  // one it is already running, costs that single item rather than the whole read.
  const next = asArray(raw.next).flatMap((entry) => {
    const item = isRecord(entry) ? entry : {};
    const name = strategyNameOf(item.strategy);
    const id = name ? howItWinsStrategyIdForName(name) : null;
    if (!id) {
      normalizations.push(`dropped the next way "${name || "unnamed"}"; it is not one of the 80 ways`);
      return [];
    }
    if (runningIds.has(id)) {
      normalizations.push(`dropped the next way "${name}"; it is already running`);
      return [];
    }
    return [{ strategy: id, note: item.note, citationIds: citationIdsFromNote(item.note) }];
  });

  if (issues.length > 0) {
    return { issues: Array.from(new Set(issues)) };
  }

  const parsed = howItWinsSchema.safeParse({
    status: "read",
    sentence: raw.sentence,
    running: running.map((entry) => ({
      strategy: entry.id,
      meaning: entry.id ? howItWinsStrategyById(entry.id).meaning : "",
      note: entry.note,
      citationIds: entry.citationIds
    })),
    pair,
    next,
    wrongIf: raw.wrong_if ?? raw.wrongIf
  });

  if (!parsed.success) {
    const names = running.map((entry) => entry.name);
    return { issues: Array.from(new Set(parsed.error.issues.map((issue) => issueSentence(issue, names)))) };
  }

  const onCard = new Set(card.citations.map((citation) => citation.id));
  const missing = Array.from(new Set(citationIdsOf(parsed.data).filter((id) => !onCard.has(id))));
  if (missing.length > 0) {
    return {
      issues: [
        `these cited ids were not supplied: ${missing.map((id) => `[${id}]`).join(" ")}; cite only supplied ids`
      ]
    };
  }

  return { read: parsed.data, normalizations };
}

// Same voice as the parse issues: the model is told which running item, by the name it wrote, and
// what to do about it. It never saw a zod path or a zero-based index.
function runningLabel(strategy: HowItWinsStrategyId, index: number): string {
  return `running item ${index + 1} ("${howItWinsStrategyById(strategy).name}")`;
}

export function styleIssuesForRead(read: HowItWins): string[] {
  const issues: string[] = [];

  const checkEmDash = (value: string, where: string) => {
    if (value.includes(EM_DASH)) {
      issues.push(`an em dash appears in ${where}; use a period or a semicolon`);
    }
  };
  const checkBannedPhrases = (value: string, where: string) => {
    const lower = value.toLowerCase();
    for (const phrase of BANNED_OUTPUT_PHRASES) {
      if (lower.includes(phrase)) {
        issues.push(`${where} uses the banned phrase "${phrase}"`);
      }
    }
  };
  const checkSentence = (value: string) => {
    if (wordCount(value) < 6 || !value.trimEnd().endsWith(".")) {
      issues.push("the sentence is too short or has no terminal period");
    }
    if (wordCount(value) > SENTENCE_MAX_WORDS) {
      issues.push(`the sentence runs past ${SENTENCE_MAX_WORDS} words; say the one load-bearing fact and stop`);
    }
  };
  const checkNote = (value: string, where: string, certaintyIssue: string) => {
    checkEmDash(value, where);
    checkBannedPhrases(value, where);
    if ((value.match(CERTAINTY_PATTERN) ?? []).length >= 3) {
      issues.push(certaintyIssue);
    }
    if (CLOSING_CERTAINTY_TAG_PATTERN.test(value)) {
      issues.push(`${where} ends with a certainty tag; put certainty in the verb`);
    }
    if (citationIdsFromNote(value).length > NOTE_MAX_CITATION_MARKERS) {
      issues.push(`${where} cites more than ${NOTE_MAX_CITATION_MARKERS} sources; keep the strongest ones`);
    }
  };

  if (read.status !== "read") {
    if (read.status === "nothing_stands_out") {
      if (read.sentence) {
        checkEmDash(read.sentence, "the sentence");
        checkBannedPhrases(read.sentence, "the sentence");
        checkSentence(read.sentence);
      }
      read.inQuestion.forEach((entry, index) => {
        const label = `in-question item ${index + 1} ("${howItWinsStrategyById(entry.strategy).name}")`;
        checkNote(
          entry.note,
          `${label}, in the note`,
          `${label}: the note repeats its certainty; put certainty in the verb that carries the claim`
        );
      });
    }
    return issues;
  }

  checkEmDash(read.sentence, "the sentence");
  checkBannedPhrases(read.sentence, "the sentence");
  checkSentence(read.sentence);
  checkEmDash(read.wrongIf, "wrong_if");
  checkBannedPhrases(read.wrongIf, "wrong_if");

  read.running.forEach((entry, index) => {
    const label = runningLabel(entry.strategy, index);
    checkNote(
      entry.note,
      `${label}, in the note`,
      `${label}: the note repeats its certainty; put certainty in the verb that carries the claim`
    );
  });

  if (read.pair) {
    checkNote(
      read.pair.note,
      "the pair note",
      "the pair note repeats its certainty; put certainty in the verb that carries the claim"
    );
    checkEmDash(read.pair.wrongIf, "the pair wrong_if");
    checkBannedPhrases(read.pair.wrongIf, "the pair wrong_if");
  }

  read.next.forEach((entry, index) => {
    const label = `next item ${index + 1} ("${howItWinsStrategyById(entry.strategy).name}")`;
    checkNote(
      entry.note,
      `${label}, in the note`,
      `${label}: the note repeats its certainty; put certainty in the verb that carries the claim`
    );
  });

  read.inQuestion.forEach((entry, index) => {
    const label = `in-question item ${index + 1} ("${howItWinsStrategyById(entry.strategy).name}")`;
    checkNote(
      entry.note,
      `${label}, in the note`,
      `${label}: the note repeats its certainty; put certainty in the verb that carries the claim`
    );
  });

  return issues;
}

function withoutEmDashes(value: string): string {
  return value.replace(/\s*\u2014\s*/g, "; ");
}

function stripEmDashes(read: HowItWins): HowItWins {
  if (read.status !== "read") {
    if (read.status === "nothing_stands_out") {
      return {
        status: "nothing_stands_out",
        ...(read.sentence ? { sentence: withoutEmDashes(read.sentence) } : {}),
        inQuestion: read.inQuestion.map((entry) => ({ ...entry, note: withoutEmDashes(entry.note) }))
      };
    }
    return read;
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
    next: read.next.map((entry) => ({ ...entry, note: withoutEmDashes(entry.note) })),
    inQuestion: read.inQuestion.map((entry) => ({ ...entry, note: withoutEmDashes(entry.note) }))
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

async function callOnce(call: PassCall, maxTokens: number, thinkingDisabled = false): Promise<string> {
  const message = await createTracedAnthropicMessage({
    client: call.client,
    label: call.label,
    model: call.model,
    stage: "how_it_wins",
    telemetry: call.telemetry,
    params: {
      model: call.model,
      max_tokens: maxTokens,
      ...(thinkingDisabled ? { thinking: { type: "disabled" as const } } : {}),
      system: [{ type: "text", text: call.system, cache_control: anthropicSystemCacheControl() }],
      messages: [{ role: "user", content: call.user }]
    }
  });

  return textFromMessage(message);
}

async function emptyTextOnly(run: () => Promise<string>): Promise<string | null> {
  try {
    return await run();
  } catch (error) {
    if (!(error instanceof HowItWinsEmptyTextError)) {
      throw error;
    }
    return null;
  }
}

async function callWithEmptyTextRetry(call: PassCall): Promise<string> {
  const first = await emptyTextOnly(() => callOnce(call, call.maxTokens));
  if (first !== null) {
    return first;
  }

  const second = await emptyTextOnly(() => callOnce(call, EMPTY_TEXT_RETRY_MAX_TOKENS));
  if (second !== null) {
    return second;
  }

  // Only the Anthropic path takes a thinking config. The openai-compat adapter would ignore the
  // key, and a provider that reasons by default has its own switch in providerDefaults.
  if (parseModelString(call.model).provider !== "anthropic") {
    throw new HowItWinsEmptyTextError();
  }

  return callOnce(call, THINKING_DISABLED_MAX_TOKENS, true);
}

function vocabularyForPrompt(): string {
  return HOW_IT_WINS_GROUPS.map(
    (group) => `${group.name}: ${group.strategies.map((strategy) => `${strategy.name} (${strategy.meaning})`).join("; ")}`
  ).join("\n");
}

async function synthesizeHowItWinsFromFrozenJudgment(
  input: {
    client: Anthropic;
    models: HowItWinsModels;
    card: ColdStartCard;
    telemetry?: AnthropicTelemetrySink;
    writerPrompt?: string;
  },
  judgment: HowItWinsJudgment
): Promise<HowItWinsResult> {
  const request = frozenHowItWinsWriterRequest(judgment);
  // The frozen prompt is the bar. The four-pass writing standard lets the model set
  // nothing_stands_out when a sentence is hard, which would drop a frozen verdict.
  const system = input.writerPrompt ?? request.prompt;
  const user = `Approved judgment:\n${JSON.stringify(request.payload)}\n\nEvidence:\n${JSON.stringify(cardForHowItWinsPrompt(input.card))}`;
  const askWriter = (userText: string) =>
    withProviderFallback("how_it_wins", input.models.writer, (model) =>
      callWithEmptyTextRetry({
        client: input.client,
        telemetry: input.telemetry,
        label: "how-it-wins-frozen-writer",
        model,
        system,
        user: userText,
        maxTokens: FIT_MAX_TOKENS
      })
    );

  let parsed = parseFrozenHowItWinsWriterDraft(await askWriter(user), judgment);
  let fitRetried = false;
  const retryUser = (issues: string[]) =>
    `${user}\n\nThe previous attempt had these problems; fix them and return only the JSON:\n- ${issues.join("\n- ")}`;

  if ("issues" in parsed) {
    fitRetried = true;
    parsed = parseFrozenHowItWinsWriterDraft(await askWriter(retryUser(parsed.issues)), judgment);
  }
  if ("issues" in parsed) {
    throw new Error(`how-it-wins frozen writer invalid: ${parsed.issues.join("; ")}`);
  }

  let read = howItWinsFromFrozenWriter(parsed.read);
  let styleIssues = styleIssuesForRead(read);
  let normalizations = parsed.normalizations;
  if (styleIssues.length > 0 && !fitRetried) {
    fitRetried = true;
    const retried = parseFrozenHowItWinsWriterDraft(await askWriter(retryUser(styleIssues)), judgment);
    if ("read" in retried) {
      parsed = retried;
      read = howItWinsFromFrozenWriter(retried.read);
      styleIssues = styleIssuesForRead(read);
      normalizations = retried.normalizations;
    }
  }

  return {
    read: stripEmDashes(read),
    editorSkipped: true,
    fitRetried,
    styleIssues,
    normalizations,
    judgment
  };
}

export async function synthesizeHowItWins(input: {
  client: Anthropic;
  models: HowItWinsModels;
  card: ColdStartCard;
  telemetry?: AnthropicTelemetrySink;
  judgment?: HowItWinsJudgment;
  // Only the eval rig sets this, to put an older writer prompt against the shipped one over a
  // single frozen verdict. Production never sets it and always writes with the shipped prompt.
  writerPrompt?: string;
}): Promise<HowItWinsResult> {
  if (input.judgment) {
    return synthesizeHowItWinsFromFrozenJudgment(input, input.judgment);
  }
  const { client, models, card, telemetry } = input;
  const cardJson = JSON.stringify(cardForHowItWinsPrompt(card));
  const task = `${HOW_IT_WINS_TASK_INTRO}\n\nThe 80 ways, in 13 groups:\n${vocabularyForPrompt()}\n\nEvidence:\n${cardJson}`;

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
  } catch {
    // Every editor failure skips the pass, transient or not. The pass is optional, and the
    // openai-compat adapter has already spent its own in-process retries by this point.
    editorSkipped = true;
  }

  const fitSystem = `${HOW_IT_WINS_WRITING_STANDARD}\n\n${HOW_IT_WINS_PASS_4}`;
  let parsed = parseHowItWinsDraft(await askWriter("fit", fitSystem, hostile, FIT_MAX_TOKENS), card);
  let styleIssues = "read" in parsed ? styleIssuesForRead(parsed.read) : [];
  let fitRetried = false;

  if ("issues" in parsed || styleIssues.length > 0) {
    const firstParse = "read" in parsed ? parsed : null;
    const issues = "issues" in parsed ? parsed.issues : styleIssues;
    const retry = await askWriter(
      "fit",
      fitSystem,
      `${hostile}\n\nThe previous attempt had these problems; fix them and return only the JSON:\n- ${issues.join("\n- ")}`,
      FIT_MAX_TOKENS
    );
    fitRetried = true;
    const retried = parseHowItWinsDraft(retry, card);

    if ("read" in retried) {
      parsed = retried;
      styleIssues = styleIssuesForRead(retried.read);
    } else if (firstParse) {
      // A first fit that parsed and only tripped style checks beats a re-ask that parses into
      // nothing. Keep it, with the style issues it still carries.
      parsed = firstParse;
    } else {
      parsed = retried;
    }
  }

  if ("issues" in parsed) {
    throw new Error(`how-it-wins draft invalid: ${parsed.issues.join("; ")}`);
  }

  return {
    read: stripEmDashes(parsed.read),
    editorSkipped,
    fitRetried,
    styleIssues,
    normalizations: parsed.normalizations
  };
}
