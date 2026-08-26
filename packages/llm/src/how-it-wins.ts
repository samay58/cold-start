/*
 * The "How it wins" read: the frozen writer renders one approved judgment into the panel's slots.
 * It chooses no label, so everything here is about getting the prose inside the writing standard,
 * with one corrective re-ask when the draft or its style misses.
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { Message } from "@anthropic-ai/sdk/resources/messages";
import {
  howItWinsStrategyById,
  type ColdStartCard,
  type HowItWins,
  type HowItWinsJudgment,
  type HowItWinsStrategyId
} from "@cold-start/core";
import { anthropicSystemCacheControl, createTracedAnthropicMessage, type AnthropicTelemetrySink } from "./anthropic";
import { parseModelString, withProviderFallback } from "./llm-provider";
import {
  citationIdsFromNote,
  frozenHowItWinsWriterRequest,
  howItWinsFromFrozenWriter,
  parseFrozenHowItWinsWriterDraft
} from "./how-it-wins-frozen-writer";

export const HOW_IT_WINS_DEFAULT_EDITOR_MODEL = "deepseek/deepseek-v4-pro";

// Three models, not two. The judge slot used to be the writer slot: the same model that renders
// the read also ran the all-80 audit, so neither could be routed without moving the other.
export type HowItWinsModels = { judge: string; writer: string; editor: string };
export type HowItWinsResult = {
  read: HowItWins;
  // Always true since the judge replaced the writer's own hostile-editor pass. The eval rig's
  // frozen arm files carry the field, so it stays on the shape they read back.
  editorSkipped: boolean;
  fitRetried: boolean;
  styleIssues: string[];
  // Slips the writer made on an optional slot that code corrected instead of failing on: a
  // dropped pair, an in-question item the approved list did not name. Not failures.
  normalizations: string[];
  judgment?: HowItWinsJudgment;
};

const WRITER_MAX_TOKENS = 16000;
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
// Every one is a formula the writer reaches for instead of saying what the source said. The
// frozen writer prompt bans the last seven by name; the first four predate it.
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

function wordCount(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

// The re-ask names the running item the way the writer wrote it, never by a zero-based index.
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

type WriterCall = {
  client: Anthropic;
  label: string;
  maxTokens: number;
  model: string;
  system: string;
  telemetry?: AnthropicTelemetrySink | undefined;
  user: string;
};

async function callOnce(call: WriterCall, maxTokens: number, thinkingDisabled = false): Promise<string> {
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

async function callWithEmptyTextRetry(call: WriterCall): Promise<string> {
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

export async function synthesizeHowItWins(input: {
  client: Anthropic;
  models: HowItWinsModels;
  card: ColdStartCard;
  telemetry?: AnthropicTelemetrySink;
  judgment: HowItWinsJudgment;
  // Only the eval rig sets this, to put an older writer prompt against the shipped one over a
  // single frozen verdict. Production never sets it and always writes with the shipped prompt.
  writerPrompt?: string;
}): Promise<HowItWinsResult> {
  const judgment = input.judgment;
  const request = frozenHowItWinsWriterRequest(judgment);
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
        maxTokens: WRITER_MAX_TOKENS
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
