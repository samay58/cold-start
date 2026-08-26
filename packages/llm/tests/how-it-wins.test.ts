import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type Anthropic from "@anthropic-ai/sdk";
import type { Message } from "@anthropic-ai/sdk/resources/messages";
import {
  HOW_IT_WINS_STRATEGIES,
  howItWinsSchema,
  howItWinsJudgmentSchema,
  howItWinsStrategyById,
  howItWinsStrategyIdForName,
  type ColdStartCard,
  type HowItWinsJudgment,
  type HowItWinsRead,
  type HowItWinsStrategyId
} from "@cold-start/core";
import { describe, expect, it, vi } from "vitest";

import { HOW_IT_WINS_FROZEN_WRITER_PROMPT } from "../src/how-it-wins-judge-prompts";
import { citationIdsFromNote } from "../src/how-it-wins-frozen-writer";
import {
  HowItWinsEmptyTextError,
  styleIssuesForRead,
  synthesizeHowItWins,
  textFromMessage
} from "../src/how-it-wins";

const tracedMessage = vi.hoisted(() => vi.fn());

vi.mock("../src/anthropic", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/anthropic")>();
  return { ...actual, createTracedAnthropicMessage: tracedMessage };
});

const testDir = dirname(fileURLToPath(import.meta.url));

const card = JSON.parse(
  readFileSync(resolve(testDir, "fixtures/how-it-wins-card.json"), "utf8")
) as ColdStartCard;

type TracedCall = {
  label: string;
  model: string;
  stage: string;
  params: {
    max_tokens: number;
    system: Array<{ text: string }>;
    messages: Array<{ content: string }>;
    thinking?: { type: string };
  };
};

function callsMade(): TracedCall[] {
  return tracedMessage.mock.calls.map((call) => call[0] as TracedCall);
}

function textMessage(text: string): Message {
  return { content: [{ type: "text", text }] } as unknown as Message;
}

function thinkingOnlyMessage(): Message {
  return { content: [{ type: "thinking", thinking: "quiet" }] } as unknown as Message;
}

function draftObject() {
  return {
    status: "read",
    sentence: "Irregular's evaluation harness sits inside model-release decisions for two frontier labs.",
    running: [
      {
        strategy: "Hybrid",
        note: "Launch coverage shows that Irregular runs frontier security research and ships the harness that produces the numbers [e1]."
      },
      {
        strategy: "Chokepoint",
        note: "Two frontier labs name its evaluations inside their release path [e2] [e4]. The same announcement names them again [e2], but does not show whether either lab must keep using them."
      },
      {
        strategy: "Prestige",
        note: "Round coverage names Sequoia as the lead, and both labs cite the evaluations by name [e12]."
      }
    ],
    pair: {
      strategies: ["Hybrid", "Chokepoint"],
      note: "Coverage shows that the research and harness ship together [e1] [e2], but does not show whether a competitor can reproduce both.",
      wrong_if: "A lab can publish an equivalent harness without losing evaluation quality."
    },
    next: [
      {
        strategy: "Standardization",
        note: "It could publish the harness as a shared standard if a third lab adopted it first [e5]."
      }
    ],
    wrong_if: "A second vendor appears in the same release notes and performs the same role."
  };
}

function strategyIdForFixture(name: string): HowItWinsStrategyId {
  const id = howItWinsStrategyIdForName(name);
  if (!id) throw new Error(`the fixture names a strategy outside the vocabulary: ${name}`);
  return id;
}

function readFromValidDraft(): HowItWinsRead {
  const draft = draftObject();
  const queued = (entry: { strategy: string; note: string }) => ({
    strategy: strategyIdForFixture(entry.strategy),
    note: entry.note,
    citationIds: citationIdsFromNote(entry.note)
  });
  const parsed = howItWinsSchema.parse({
    status: "read",
    sentence: draft.sentence,
    running: draft.running.map((entry) => ({
      ...queued(entry),
      meaning: howItWinsStrategyById(strategyIdForFixture(entry.strategy)).meaning
    })),
    pair: {
      strategies: draft.pair.strategies.map(strategyIdForFixture),
      note: draft.pair.note,
      wrongIf: draft.pair.wrong_if,
      citationIds: citationIdsFromNote(draft.pair.note)
    },
    next: draft.next.map(queued),
    wrongIf: draft.wrong_if
  });
  if (parsed.status !== "read") throw new Error("the fixture draft should build a read");
  return parsed;
}

function writerModels() {
  return { judge: "claude-opus-5", writer: "claude-sonnet-5", editor: "deepseek/deepseek-v4-pro" };
}

function frozenJudgment(
  currentIds: HowItWinsStrategyId[] = ["hybrid", "chokepoint", "prestige"]
): HowItWinsJudgment {
  const selected = new Set(currentIds);
  return howItWinsJudgmentSchema.parse({
    version: 1,
    hashes: {
      evidencePacket: "a".repeat(64),
      prompt: "b".repeat(64),
      vocabulary: "c".repeat(64)
    },
    evidenceCutoff: "2026-08-21T00:00:00.000Z",
    evidenceRegistry: [
      {
        evidenceId: "e1",
        text: "A current source describes the mechanism.",
        source: "Primary source",
        sourceDate: "2026-08-20",
        attribution: "independent",
        scope: "company"
      }
    ],
    claims: [
      { claimId: "c1", type: "observed_fact", text: "A current source describes the mechanism.", evidenceIds: ["e1"] }
    ],
    materialBets: [
      {
        betId: "b1",
        statement: "The company is betting on one evidenced mechanism.",
        scope: "company",
        supportingEvidenceIds: ["e1"],
        scopeReasons: ["The same buyer and operating model apply."]
      }
    ],
    strategyEvaluations: HOW_IT_WINS_STRATEGIES.map((strategy) =>
      selected.has(strategy.id)
        ? {
            strategyId: strategy.id,
            disposition: "current",
            betIds: ["b1"],
            mechanism: "The mechanism changes how the company is chosen.",
            evidenceGate: "pass",
            evidenceIds: ["e1"],
            claimIds: ["c1"],
            counterevidenceIds: [],
            dimensions: {
              evidenceStrength: "direct",
              centrality: "central",
              materiality: "material",
              distinctiveness: "company_specific",
              independence: "independent",
              explanatoryValue: "necessary"
            },
            presentRelevance: "current",
            historicalEvidenceIds: [],
            presentEvidenceIds: ["e1"],
            presentBridge: null,
            siblingCandidateIds: [],
            siblingResolutions: [],
            notYet: null,
            dispositionReason: "The mechanism is current and material."
          }
        : {
            strategyId: strategy.id,
            disposition: "insufficient_evidence",
            betIds: [],
            mechanism: null,
            evidenceGate: "fail",
            evidenceIds: [],
            claimIds: [],
            counterevidenceIds: [],
            dimensions: {
              evidenceStrength: "insufficient",
              centrality: "not_reached",
              materiality: "not_reached",
              distinctiveness: "not_reached",
              independence: "not_reached",
              explanatoryValue: "not_reached"
            },
            presentRelevance: "not_reached",
            historicalEvidenceIds: [],
            presentEvidenceIds: [],
            presentBridge: null,
            siblingCandidateIds: [],
            siblingResolutions: [],
            notYet: null,
            dispositionReason: "The supplied evidence does not establish this mechanism."
          }
    ),
    currentStrategyIds: currentIds,
    unusualPair: null,
    openQuestions: [],
    overallWrongCondition: {
      condition: "The current mechanism stops affecting buyer choice.",
      evidenceIds: ["e1"]
    },
    disagreements: [],
    overrides: [],
    calls: [
      {
        callId: "global-1",
        stage: "global_judge",
        provider: "fake-strong",
        model: "fake-model",
        inputTokens: 10,
        outputTokens: 20,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
        actualCostUsd: null,
        estimatedCostUsd: 0,
        latencyMs: 1,
        retryCount: 0,
        thinkingState: "unknown",
        outcome: "ok"
      }
    ]
  });
}

function frozenWriterDraftJson(
  strategyIds: HowItWinsStrategyId[] = ["hybrid", "chokepoint", "prestige"],
  mutate?: (draft: { wrong_if: string }) => void
) {
  const draft = {
    status: "read",
    sentence: "Irregular's evaluation harness sits inside model-release decisions for two frontier labs.",
    current: strategyIds.map((strategy) => ({
      strategy,
      note: `Irregular uses ${strategy} in its current bet [e1].`
    })),
    pair: null,
    not_yet: [],
    in_question: [],
    wrong_if: "A second vendor appears in the same release notes and performs the same role."
  };
  mutate?.(draft);
  return JSON.stringify(draft);
}

async function runWriter(models = writerModels()) {
  return synthesizeHowItWins({ client: {} as Anthropic, models, card, judgment: frozenJudgment() });
}

describe("styleIssuesForRead", () => {
  it("passes a clean read", () => {
    expect(styleIssuesForRead(readFromValidDraft())).toEqual([]);
  });

  it("does not review canonical meaning lines as model prose", () => {
    const read = readFromValidDraft();
    read.running = read.running.map((entry, index) =>
      index === 0 ? { ...entry, meaning: "Two competences at once" } : entry
    );

    expect(styleIssuesForRead(read)).toEqual([]);
  });

  it("flags banned self-referential phrasing", () => {
    const read = readFromValidDraft();
    read.wrongIf = "The read would weaken if another vendor appears.";

    expect(styleIssuesForRead(read)).toContain('wrong_if uses the banned phrase "the read would weaken"');
  });

  it("flags a note that states certainty three times", () => {
    const read = readFromValidDraft();
    read.running = read.running.map((entry, index) =>
      index === 0
        ? { ...entry, note: "Reported by the round coverage [e1]. Observed in the same post. Inferred from both." }
        : entry
    );

    expect(styleIssuesForRead(read)).toContain(
      'running item 1 ("Hybrid"): the note repeats its certainty; put certainty in the verb that carries the claim'
    );
  });

  it("flags a closing certainty tag", () => {
    const read = readFromValidDraft();
    read.running = read.running.map((entry, index) =>
      index === 0 ? { ...entry, note: "The launch coverage names the harness [e1]. Reported." } : entry
    );

    expect(styleIssuesForRead(read)).toContain(
      'running item 1 ("Hybrid"), in the note ends with a certainty tag; put certainty in the verb'
    );
  });

  it("flags an em dash anywhere in the read", () => {
    const read = readFromValidDraft();
    read.wrongIf = "A second vendor \u2014 any credible one \u2014 would change the read.";

    expect(styleIssuesForRead(read)).toContain("an em dash appears in wrong_if; use a period or a semicolon");
  });

  it("flags a sentence that is not a complete sentence", () => {
    const read = readFromValidDraft();
    read.sentence = "It wins";

    expect(styleIssuesForRead(read)).toContain("the sentence is too short or has no terminal period");
  });

  it("flags a sentence that runs past the word budget", () => {
    const read = readFromValidDraft();
    read.sentence = `${Array.from({ length: 46 }, () => "word").join(" ")}.`;

    expect(styleIssuesForRead(read)).toContain(
      "the sentence runs past 45 words; say the one load-bearing fact and stop"
    );
  });

  it("flags a note that cites more than four sources", () => {
    const read = readFromValidDraft();
    read.running = read.running.map((entry, index) =>
      index === 0
        ? { ...entry, note: "The launch coverage names the harness [e1] [e2] [e4] [e5] [e12]." }
        : entry
    );

    expect(styleIssuesForRead(read)).toContain(
      'running item 1 ("Hybrid"), in the note cites more than 4 sources; keep the strongest ones'
    );
  });

  it("flags every phrase the frozen writer prompt bans by name", () => {
    for (const phrase of [
      "what is unresolved is whether",
      "would settle it",
      "would resolve it",
      "the record",
      "the evidence shows",
      "bears this out",
      "is consistent with"
    ]) {
      const read = readFromValidDraft();
      read.wrongIf = `A second vendor appears and ${phrase} changes.`;

      expect(styleIssuesForRead(read)).toContain(`wrong_if uses the banned phrase "${phrase}"`);
    }
  });
});

describe("textFromMessage", () => {
  it("joins the text blocks", () => {
    expect(textFromMessage(textMessage("the draft"))).toBe("the draft");
  });

  it("throws when the response carries no text block", () => {
    expect(() => textFromMessage(thinkingOnlyMessage())).toThrow(HowItWinsEmptyTextError);
  });
});

describe("synthesizeHowItWins", () => {
  it("retries at a higher token ceiling when the response has no text", async () => {
    tracedMessage.mockReset();
    tracedMessage
      .mockResolvedValueOnce(thinkingOnlyMessage())
      .mockResolvedValueOnce(textMessage(frozenWriterDraftJson()));

    const result = await runWriter();

    expect(result.read.status).toBe("read");
    const calls = callsMade();
    expect(calls[0]?.params.max_tokens).toBe(16000);
    expect(calls[1]?.params.max_tokens).toBe(21000);
    expect(calls[1]?.params.thinking).toBeUndefined();
    expect(calls[1]?.label).toBe("how-it-wins-frozen-writer");
  });

  it("turns thinking off for a third attempt when both budgets came back empty", async () => {
    tracedMessage.mockReset();
    tracedMessage
      .mockResolvedValueOnce(thinkingOnlyMessage())
      .mockResolvedValueOnce(thinkingOnlyMessage())
      .mockResolvedValueOnce(textMessage(frozenWriterDraftJson()));

    const result = await runWriter();

    expect(result.read.status).toBe("read");
    const calls = callsMade();
    expect(calls[2]?.params.thinking?.type).toBe("disabled");
    expect(calls[2]?.params.max_tokens).toBe(16000);
  });

  it("gives up after three empty responses", async () => {
    tracedMessage.mockReset();
    tracedMessage
      .mockResolvedValueOnce(thinkingOnlyMessage())
      .mockResolvedValueOnce(thinkingOnlyMessage())
      .mockResolvedValueOnce(thinkingOnlyMessage());

    await expect(runWriter()).rejects.toThrow(HowItWinsEmptyTextError);
    expect(tracedMessage).toHaveBeenCalledTimes(3);
  });

  it("does not offer a thinking config to a non-Anthropic model", async () => {
    tracedMessage.mockReset();
    tracedMessage
      .mockResolvedValueOnce(thinkingOnlyMessage())
      .mockResolvedValueOnce(thinkingOnlyMessage());

    // Two empty responses end a DeepSeek writer instead of buying a third attempt.
    await expect(runWriter({ ...writerModels(), writer: "deepseek/deepseek-v4-pro" }))
      .rejects.toThrow(HowItWinsEmptyTextError);
    expect(tracedMessage).toHaveBeenCalledTimes(2);
    expect(callsMade().every((call) => call.params.thinking === undefined)).toBe(true);
  });

  it("re-asks the writer once with the style issues and reports the retry", async () => {
    tracedMessage.mockReset();
    tracedMessage
      .mockResolvedValueOnce(
        textMessage(
          frozenWriterDraftJson(undefined, (draft) => {
            draft.wrong_if = "The read would weaken if another vendor appears.";
          })
        )
      )
      .mockResolvedValueOnce(textMessage(frozenWriterDraftJson()));

    const result = await runWriter();

    expect(tracedMessage).toHaveBeenCalledTimes(2);
    expect(result.fitRetried).toBe(true);
    expect(result.styleIssues).toEqual([]);
    expect(result.read.status).toBe("read");

    const retry = callsMade()[1];
    expect(retry?.label).toBe("how-it-wins-frozen-writer");
    expect(retry?.params.messages[0]?.content).toContain(
      'wrong_if uses the banned phrase "the read would weaken"'
    );
    expect(retry?.params.messages[0]?.content).toContain("fix them and return only the JSON");
  });

  it("sends no temperature on the writer call", async () => {
    tracedMessage.mockReset();
    tracedMessage.mockResolvedValueOnce(textMessage(frozenWriterDraftJson()));

    await runWriter();

    expect(tracedMessage).toHaveBeenCalledTimes(1);
    for (const call of callsMade()) {
      expect(call.params).not.toHaveProperty("temperature");
    }
  });

  it("passes evidence without naming it as a card", async () => {
    tracedMessage.mockReset();
    tracedMessage.mockResolvedValueOnce(textMessage(frozenWriterDraftJson()));

    await runWriter();

    const user = callsMade()[0]?.params.messages[0]?.content ?? "";
    expect(user).toContain("Evidence:");
    expect(user).not.toContain("The company's card");
    expect(user.toLowerCase()).not.toContain("on the card");
  });

  it("renders a frozen judgment in one writer call and skips the hostile editor", async () => {
    tracedMessage.mockReset();
    tracedMessage.mockResolvedValueOnce(textMessage(frozenWriterDraftJson()));

    const judgment = frozenJudgment();
    const result = await synthesizeHowItWins({
      client: {} as Anthropic,
      models: writerModels(),
      card,
      judgment
    });

    expect(result.editorSkipped).toBe(true);
    expect(result.judgment).toBe(judgment);
    expect(result.read.status).toBe("read");
    if (result.read.status !== "read") throw new Error("expected a frozen read");
    expect(result.read.running.map((entry) => entry.strategy)).toEqual(["hybrid", "chokepoint", "prestige"]);
    expect(tracedMessage).toHaveBeenCalledTimes(1);

    const call = callsMade()[0];
    expect(call?.label).toBe("how-it-wins-frozen-writer");
    const system = call?.params.system.map((block) => block.text).join("") ?? "";
    expect(system).toContain(HOW_IT_WINS_FROZEN_WRITER_PROMPT);
    expect(system).not.toContain("If it cannot be written plainly");
    expect(call?.params.messages[0]?.content).toContain("Approved judgment:");
    expect(call?.params.messages[0]?.content).not.toContain("how-it-wins-reason");
  });

  it("carries the writer's normalizations onto the frozen result", async () => {
    tracedMessage.mockReset();
    tracedMessage.mockResolvedValueOnce(
      textMessage(
        JSON.stringify({
          status: "read",
          sentence: "Irregular's evaluation harness sits inside model-release decisions for two frontier labs.",
          current: ["hybrid", "chokepoint", "prestige"].map((strategy) => ({
            strategy,
            note: `Irregular uses ${strategy} in its current bet [e1].`
          })),
          pair: null,
          not_yet: [],
          in_question: [{ strategy: "aggregation", note: "A strategy nothing in the approved list named." }],
          wrong_if: "A second vendor appears in the same release notes and performs the same role."
        })
      )
    );

    const judgment = frozenJudgment();
    const result = await synthesizeHowItWins({
      client: {} as Anthropic,
      models: writerModels(),
      card,
      judgment
    });

    expect(tracedMessage).toHaveBeenCalledTimes(1);
    expect(result.read.status).toBe("read");
    if (result.read.status !== "read") throw new Error("expected a frozen read");
    expect(result.read.inQuestion).toEqual([]);
    expect(result.normalizations).toHaveLength(1);
    expect(result.normalizations[0]).toMatch(/in-question/);
  });

  it("retries once, then throws, when the writer changes an approved current label", async () => {
    tracedMessage.mockReset();
    const changedLabels = frozenWriterDraftJson(["chokepoint", "hybrid", "prestige"]);
    tracedMessage.mockResolvedValueOnce(textMessage(changedLabels)).mockResolvedValueOnce(textMessage(changedLabels));

    const judgment = frozenJudgment();
    await expect(
      synthesizeHowItWins({ client: {} as Anthropic, models: writerModels(), card, judgment })
    ).rejects.toThrow(/how-it-wins frozen writer invalid/);

    expect(tracedMessage).toHaveBeenCalledTimes(2);
  });
});
