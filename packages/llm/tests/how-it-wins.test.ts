import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type Anthropic from "@anthropic-ai/sdk";
import type { Message } from "@anthropic-ai/sdk/resources/messages";
import {
  HOW_IT_WINS_STRATEGIES,
  howItWinsJudgmentSchema,
  type ColdStartCard,
  type HowItWinsJudgment,
  type HowItWinsRead,
  type HowItWinsStrategyId
} from "@cold-start/core";
import { describe, expect, it, vi } from "vitest";

import {
  HOW_IT_WINS_HOSTILE_EDITOR,
  HOW_IT_WINS_PASS_2,
  HOW_IT_WINS_PASS_4,
  HOW_IT_WINS_SLOTS,
  HOW_IT_WINS_TASK_INTRO,
  HOW_IT_WINS_WRITING_STANDARD
} from "../src/how-it-wins-prompts";
import { HOW_IT_WINS_FROZEN_WRITER_PROMPT } from "../src/how-it-wins-judge-prompts";
import {
  HowItWinsEmptyTextError,
  parseHowItWinsDraft,
  styleIssuesForRead,
  synthesizeHowItWins,
  textFromMessage
} from "../src/how-it-wins";
import { isTransientLlmError } from "../src/transient-error";

const tracedMessage = vi.hoisted(() => vi.fn());

vi.mock("../src/anthropic", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/anthropic")>();
  return { ...actual, createTracedAnthropicMessage: tracedMessage };
});

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, "../../..");
const promptDir = resolve(repoRoot, "docs/product/design/2026-08-18-moat-read-direction/prompt-test");

const card = JSON.parse(
  readFileSync(resolve(testDir, "fixtures/how-it-wins-irregular.json"), "utf8")
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

function draftJson(mutate?: (draft: ReturnType<typeof draftObject>) => void): string {
  const draft = draftObject();
  mutate?.(draft);
  return JSON.stringify(draft);
}

function readFromValidDraft(): HowItWinsRead {
  const parsed = parseHowItWinsDraft(draftJson(), card);
  if (!("read" in parsed) || parsed.read.status !== "read") {
    throw new Error("the fixture draft should parse into a read");
  }
  return structuredClone(parsed.read);
}

function writerModels() {
  return { writer: "claude-sonnet-5", editor: "deepseek/deepseek-v4-pro" };
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

function frozenWriterDraftJson(strategyIds: HowItWinsStrategyId[] = ["hybrid", "chokepoint", "prestige"]) {
  return JSON.stringify({
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
  });
}

async function runDriver() {
  return synthesizeHowItWins({ client: {} as Anthropic, models: writerModels(), card });
}

describe("how-it-wins prompt constants", () => {
  it("carries the writing standard verbatim", () => {
    expect(HOW_IT_WINS_WRITING_STANDARD).toBe(readFileSync(resolve(promptDir, "writing-standard.md"), "utf8"));
  });

  it("carries the hostile editor verbatim", () => {
    expect(HOW_IT_WINS_HOSTILE_EDITOR).toBe(readFileSync(resolve(promptDir, "hostile-editor.md"), "utf8"));
  });

  it("makes wrong_if a world conditional and never asks for a model-authored meaning line", () => {
    expect(HOW_IT_WINS_SLOTS).toContain("plain conditional about the world");
    expect(HOW_IT_WINS_SLOTS).toContain('"running": two to four items {strategy, note}');
    expect(HOW_IT_WINS_SLOTS).toContain("Irregular's evaluation harness sits inside model-release decisions");
    expect(HOW_IT_WINS_SLOTS).not.toContain('"meaning"');
    expect(HOW_IT_WINS_PASS_2).not.toContain("Meaning lines");
    expect(HOW_IT_WINS_PASS_4).not.toContain("meaning line");
  });

  it("tells every writer to keep the input unnamed and lead with the company and mechanism", () => {
    expect(HOW_IT_WINS_TASK_INTRO).toContain("Never refer to the input");
    expect(HOW_IT_WINS_TASK_INTRO).toContain("Lead with the company and the mechanism");
    expect(HOW_IT_WINS_TASK_INTRO).not.toContain("from the card");
    expect(HOW_IT_WINS_TASK_INTRO).not.toContain("card's citations");
  });

  it("holds the frozen writer to the Investor Lens bar and the in-question slot", () => {
    expect(HOW_IT_WINS_FROZEN_WRITER_PROMPT).toContain("Investor Lens");
    expect(HOW_IT_WINS_FROZEN_WRITER_PROMPT).toContain("in-question");
    expect(HOW_IT_WINS_FROZEN_WRITER_PROMPT).toContain("in_question");
    expect(HOW_IT_WINS_FROZEN_WRITER_PROMPT).toContain("Do not write it as if it were current");
    expect(HOW_IT_WINS_FROZEN_WRITER_PROMPT).not.toContain("on the card");
  });

  it("makes the hostile editor catch the sitting's four banned phrases", () => {
    for (const phrase of ["the read would weaken", "would weaken if", "is observed fact", "on the card"]) {
      expect(HOW_IT_WINS_HOSTILE_EDITOR.toLowerCase()).toContain(phrase);
    }
  });
});

describe("parseHowItWinsDraft", () => {
  it("maps strategy names to ids and derives citation ids from the visible markers", () => {
    const parsed = parseHowItWinsDraft(draftJson(), card);

    expect("read" in parsed).toBe(true);
    if (!("read" in parsed) || parsed.read.status !== "read") {
      throw new Error("expected a read");
    }
    expect(parsed.read.running.map((entry) => entry.strategy)).toEqual(["hybrid", "chokepoint", "prestige"]);
    expect(parsed.read.running.map((entry) => entry.meaning)).toEqual([
      "Competence in two distinct areas, or two strengths not usually found together.",
      "Controls a passage that competitors or prey must pass through.",
      "Endorsed by authoritative sources through awards, degrees, or recognition."
    ]);
    expect(parsed.read.running[0]?.citationIds).toEqual(["e1"]);
    expect(parsed.read.running[1]?.citationIds).toEqual(["e2", "e4"]);
    expect(parsed.read.pair?.strategies).toEqual(["hybrid", "chokepoint"]);
    expect(parsed.read.pair?.citationIds).toEqual(["e1", "e2"]);
    expect(parsed.read.pair?.wrongIf).toBe("A lab can publish an equivalent harness without losing evaluation quality.");
    expect(parsed.read.next[0]?.strategy).toBe("standardization");
    expect(parsed.read.next[0]?.citationIds).toEqual(["e5"]);
    expect(parsed.read.inQuestion).toEqual([]);
    expect(parsed.read.wrongIf).toBe("A second vendor appears in the same release notes and performs the same role.");
  });

  it("reads a draft wrapped in a code fence", () => {
    const parsed = parseHowItWinsDraft(`Here it is:\n\n\`\`\`json\n${draftJson()}\n\`\`\`\n`, card);

    expect("read" in parsed).toBe(true);
  });

  it("derives every id from a comma list inside one bracket", () => {
    const parsed = parseHowItWinsDraft(
      draftJson((draft) => {
        draft.running = draft.running.map((entry, index) =>
          index === 0
            ? { ...entry, note: "It ships research and harness together [e1, e2]. Observed in the coverage." }
            : entry
        );
      }),
      card
    );

    if (!("read" in parsed) || parsed.read.status !== "read") {
      throw new Error("expected a read");
    }
    expect(parsed.read.running[0]?.citationIds).toEqual(["e1", "e2"]);
    expect(parsed.read.running[0]?.note).toContain("[e1, e2]");
  });

  it("returns a nothing_stands_out read with its sentence", () => {
    const parsed = parseHowItWinsDraft(
      JSON.stringify({ status: "nothing_stands_out", sentence: "It competes the way most LLM tooling companies do." }),
      card
    );

    expect(parsed).toEqual({
      read: { status: "nothing_stands_out", sentence: "It competes the way most LLM tooling companies do.", inQuestion: [] },
      normalizations: []
    });
  });

  it("reports a citation id that is not on the card", () => {
    const parsed = parseHowItWinsDraft(
      draftJson((draft) => {
        draft.running = draft.running.map((entry, index) =>
          index === 0 ? { ...entry, note: "It ships the harness itself [z9]. Observed." } : entry
        );
      }),
      card
    );

    expect("issues" in parsed).toBe(true);
    if (!("issues" in parsed)) {
      throw new Error("expected issues");
    }
    expect(parsed.issues.join(" ")).toContain("[z9]");
    expect(parsed.issues.join(" ")).toContain("cite only supplied ids");
  });

  it("reports a strategy name outside the vocabulary", () => {
    const parsed = parseHowItWinsDraft(
      draftJson((draft) => {
        draft.running = draft.running.map((entry, index) => (index === 0 ? { ...entry, strategy: "Moat" } : entry));
      }),
      card
    );

    expect("issues" in parsed).toBe(true);
    if (!("issues" in parsed)) {
      throw new Error("expected issues");
    }
    expect(parsed.issues).toContain('"Moat" is not one of the 80 ways; use a name from the list exactly as written');
  });

  it("reports a running note with no citation marker", () => {
    const parsed = parseHowItWinsDraft(
      draftJson((draft) => {
        draft.running = draft.running.map((entry, index) =>
          index === 2 ? { ...entry, note: "Sequoia led the round and both labs cite the work. Reported." } : entry
        );
      }),
      card
    );

    expect("issues" in parsed).toBe(true);
    if (!("issues" in parsed)) {
      throw new Error("expected issues");
    }
    expect(parsed.issues).toContain(
      'running item 3 ("Prestige") has no citation ids in square brackets in its note; cite at least one supplied id, like [e3]'
    );
  });

  it("quotes the parser error when the response is not JSON", () => {
    const parsed = parseHowItWinsDraft("I could not write this read.", card);

    if (!("issues" in parsed)) {
      throw new Error("expected issues");
    }
    expect(parsed.issues[0]).toMatch(/^the JSON could not be parsed: /);
  });

  it("reports a status outside the two the slots allow", () => {
    const parsed = parseHowItWinsDraft(JSON.stringify({ ...JSON.parse(draftJson()), status: "nothing_unusual" }), card);

    expect(parsed).toEqual({ issues: ['status must be "read" or "nothing_stands_out"'] });
  });

  it("reports a pair leg that is not one of the running ways", () => {
    const parsed = parseHowItWinsDraft(
      draftJson((draft) => {
        draft.pair = { ...draft.pair, strategies: ["Hybrid", "Curation"] };
      }),
      card
    );

    expect(parsed).toEqual({ issues: ["the pair must name two of the running strategies, or be null"] });
  });

  it("records no normalizations for a clean draft", () => {
    const parsed = parseHowItWinsDraft(draftJson(), card);

    if (!("read" in parsed)) {
      throw new Error("expected a read");
    }
    expect(parsed.normalizations).toEqual([]);
  });

  it("drops a next way that is already running instead of failing", () => {
    const parsed = parseHowItWinsDraft(
      draftJson((draft) => {
        draft.next = [{ strategy: "Prestige", note: "It could lean harder on the endorsements [e5]." }];
      }),
      card
    );

    if (!("read" in parsed) || parsed.read.status !== "read") {
      throw new Error("expected a read");
    }
    expect(parsed.read.next).toEqual([]);
    expect(parsed.normalizations).toEqual(['dropped the next way "Prestige"; it is already running']);
  });

  it("drops a next way whose name is not one of the 80 instead of failing", () => {
    const parsed = parseHowItWinsDraft(
      draftJson((draft) => {
        draft.next = [{ strategy: "Expansion", note: "It could open a second market [e5]." }];
      }),
      card
    );

    if (!("read" in parsed) || parsed.read.status !== "read") {
      throw new Error("expected a read");
    }
    expect(parsed.read.next).toEqual([]);
    expect(parsed.normalizations).toEqual(['dropped the next way "Expansion"; it is not one of the 80 ways']);
  });

  it("keeps the first mention when a running way is repeated", () => {
    const parsed = parseHowItWinsDraft(
      draftJson((draft) => {
        draft.running = [
          ...draft.running,
          {
            strategy: "Chokepoint",
            note: "Said a second time, with the same evidence [e2]."
          }
        ];
      }),
      card
    );

    if (!("read" in parsed) || parsed.read.status !== "read") {
      throw new Error("expected a read");
    }
    expect(parsed.read.running.map((entry) => entry.strategy)).toEqual(["hybrid", "chokepoint", "prestige"]);
    expect(parsed.read.running[1]?.citationIds).toEqual(["e2", "e4"]);
    expect(parsed.normalizations).toEqual(['dropped a repeated running way: "Chokepoint"']);
  });

  it("resolves pair legs written in another case or punctuation", () => {
    const parsed = parseHowItWinsDraft(
      draftJson((draft) => {
        draft.pair = { ...draft.pair, strategies: ["hybrid", "choke-point"] };
      }),
      card
    );

    if (!("read" in parsed) || parsed.read.status !== "read") {
      throw new Error("expected a read");
    }
    expect(parsed.read.pair?.strategies).toEqual(["hybrid", "chokepoint"]);
  });
});

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
  it("skips the hostile editor when it fails on a semantic error", async () => {
    tracedMessage.mockReset();
    tracedMessage
      .mockResolvedValueOnce(textMessage("The reasoning, at length."))
      .mockResolvedValueOnce(textMessage(draftJson()))
      .mockRejectedValueOnce(new Error("editor model rejected the request"))
      .mockResolvedValueOnce(textMessage(draftJson()));

    const result = await runDriver();

    expect(result.read.status).toBe("read");
    expect(result.editorSkipped).toBe(true);
    expect(result.fitRetried).toBe(false);
    expect(result.styleIssues).toEqual([]);
    expect(tracedMessage).toHaveBeenCalledTimes(4);

    const calls = callsMade();
    expect(calls.map((call) => call.label)).toEqual([
      "how-it-wins-reason",
      "how-it-wins-edit",
      "how-it-wins-editor",
      "how-it-wins-fit"
    ]);
    expect(calls.every((call) => call.stage === "how_it_wins")).toBe(true);
    expect(calls[2]?.model).toBe("deepseek/deepseek-v4-pro");
    expect(calls[3]?.model).toBe("claude-sonnet-5");
  });

  it("skips the hostile editor when it fails on transport too", async () => {
    // The pass is optional and the adapter already retried in-process, so a transient editor
    // failure degrades like any other instead of failing the read.
    const transient = new Error("openai-compat request failed with 529: overloaded");
    expect(isTransientLlmError(transient)).toBe(true);

    tracedMessage.mockReset();
    tracedMessage
      .mockResolvedValueOnce(textMessage("The reasoning, at length."))
      .mockResolvedValueOnce(textMessage(draftJson()))
      .mockRejectedValueOnce(transient)
      .mockResolvedValueOnce(textMessage(draftJson()));

    const result = await runDriver();

    expect(result.editorSkipped).toBe(true);
    expect(result.read.status).toBe("read");
    expect(tracedMessage).toHaveBeenCalledTimes(4);
    expect(callsMade()[3]?.label).toBe("how-it-wins-fit");
  });

  it("retries the first pass at a higher token ceiling when the response has no text", async () => {
    tracedMessage.mockReset();
    tracedMessage
      .mockResolvedValueOnce(thinkingOnlyMessage())
      .mockResolvedValueOnce(textMessage("The reasoning, at length."))
      .mockResolvedValueOnce(textMessage(draftJson()))
      .mockResolvedValueOnce(textMessage(draftJson()))
      .mockResolvedValueOnce(textMessage(draftJson()));

    const result = await runDriver();

    expect(result.editorSkipped).toBe(false);
    const calls = callsMade();
    expect(calls[0]?.params.max_tokens).toBe(16000);
    expect(calls[1]?.params.max_tokens).toBe(21000);
    expect(calls[1]?.params.thinking).toBeUndefined();
    expect(calls[1]?.label).toBe("how-it-wins-reason");
  });

  it("turns thinking off for a third attempt when both budgets came back empty", async () => {
    tracedMessage.mockReset();
    tracedMessage
      .mockResolvedValueOnce(thinkingOnlyMessage())
      .mockResolvedValueOnce(thinkingOnlyMessage())
      .mockResolvedValueOnce(textMessage("The reasoning, at length."))
      .mockResolvedValueOnce(textMessage(draftJson()))
      .mockResolvedValueOnce(textMessage(draftJson()))
      .mockResolvedValueOnce(textMessage(draftJson()));

    const result = await runDriver();

    expect(result.read.status).toBe("read");
    const calls = callsMade();
    expect(calls[2]?.params.thinking?.type).toBe("disabled");
    expect(calls[2]?.params.max_tokens).toBe(16000);
    expect(calls[2]?.label).toBe("how-it-wins-reason");
    expect(calls[3]?.params.thinking).toBeUndefined();
  });

  it("gives up after three empty responses", async () => {
    tracedMessage.mockReset();
    tracedMessage
      .mockResolvedValueOnce(thinkingOnlyMessage())
      .mockResolvedValueOnce(thinkingOnlyMessage())
      .mockResolvedValueOnce(thinkingOnlyMessage());

    await expect(runDriver()).rejects.toThrow(HowItWinsEmptyTextError);
    expect(tracedMessage).toHaveBeenCalledTimes(3);
  });

  it("does not offer a thinking config to a non-Anthropic model", async () => {
    tracedMessage.mockReset();
    tracedMessage
      .mockResolvedValueOnce(textMessage("The reasoning, at length."))
      .mockResolvedValueOnce(textMessage(draftJson()))
      .mockResolvedValueOnce(thinkingOnlyMessage())
      .mockResolvedValueOnce(thinkingOnlyMessage())
      .mockResolvedValueOnce(textMessage(draftJson()));

    const result = await runDriver();

    // The editor is deepseek: two empty responses end the pass instead of a third attempt.
    expect(result.editorSkipped).toBe(true);
    expect(tracedMessage).toHaveBeenCalledTimes(5);
    expect(callsMade().every((call) => call.params.thinking === undefined)).toBe(true);
  });

  it("re-asks the fit pass once with the style issues and reports the retry", async () => {
    tracedMessage.mockReset();
    tracedMessage
      .mockResolvedValueOnce(textMessage("The reasoning, at length."))
      .mockResolvedValueOnce(textMessage(draftJson()))
      .mockResolvedValueOnce(textMessage(draftJson()))
      .mockResolvedValueOnce(
        textMessage(
          draftJson((draft) => {
            draft.wrong_if = "The read would weaken if another vendor appears.";
          })
        )
      )
      .mockResolvedValueOnce(textMessage(draftJson()));

    const result = await runDriver();

    expect(tracedMessage).toHaveBeenCalledTimes(5);
    expect(result.fitRetried).toBe(true);
    expect(result.styleIssues).toEqual([]);
    expect(result.read.status).toBe("read");

    const retry = callsMade()[4];
    expect(retry?.label).toBe("how-it-wins-fit");
    expect(retry?.params.messages[0]?.content).toContain(
      'wrong_if uses the banned phrase "the read would weaken"'
    );
    expect(retry?.params.messages[0]?.content).toContain("fix them and return only the JSON");
  });

  it("carries the parse normalizations out on the result", async () => {
    const withNormalizations = draftJson((draft) => {
      draft.next = [{ strategy: "Expansion", note: "It could open a second market [e5]." }];
    });

    tracedMessage.mockReset();
    tracedMessage
      .mockResolvedValueOnce(textMessage("The reasoning, at length."))
      .mockResolvedValueOnce(textMessage(draftJson()))
      .mockResolvedValueOnce(textMessage(draftJson()))
      .mockResolvedValueOnce(textMessage(withNormalizations));

    const result = await runDriver();

    expect(result.normalizations).toEqual(['dropped the next way "Expansion"; it is not one of the 80 ways']);
    expect(result.fitRetried).toBe(false);
  });

  it("sends no temperature on any pass", async () => {
    tracedMessage.mockReset();
    tracedMessage
      .mockResolvedValueOnce(textMessage("The reasoning, at length."))
      .mockResolvedValueOnce(textMessage(draftJson()))
      .mockResolvedValueOnce(textMessage(draftJson()))
      .mockResolvedValueOnce(textMessage(draftJson()));

    await runDriver();

    expect(tracedMessage).toHaveBeenCalledTimes(4);
    for (const call of callsMade()) {
      expect(call.params).not.toHaveProperty("temperature");
    }
  });

  it("keeps the first parsed read when the corrective re-ask parses into nothing", async () => {
    const styledDraft = draftJson((draft) => {
      draft.wrong_if = "The read would weaken if another vendor appears.";
    });

    tracedMessage.mockReset();
    tracedMessage
      .mockResolvedValueOnce(textMessage("The reasoning, at length."))
      .mockResolvedValueOnce(textMessage(draftJson()))
      .mockResolvedValueOnce(textMessage(draftJson()))
      .mockResolvedValueOnce(textMessage(styledDraft))
      .mockResolvedValueOnce(textMessage("I cannot write this read."));

    const result = await runDriver();

    expect(result.fitRetried).toBe(true);
    expect(result.read.status).toBe("read");
    if (result.read.status !== "read") {
      throw new Error("expected a read");
    }
    expect(result.read.running[0]?.meaning).toBe(
      "Competence in two distinct areas, or two strengths not usually found together."
    );
    expect(result.styleIssues).toContain(
      'wrong_if uses the banned phrase "the read would weaken"'
    );
  });

  it("passes evidence without naming it as a card", async () => {
    tracedMessage.mockReset();
    tracedMessage
      .mockResolvedValueOnce(textMessage("The reasoning, at length."))
      .mockResolvedValueOnce(textMessage(draftJson()))
      .mockResolvedValueOnce(textMessage(draftJson()))
      .mockResolvedValueOnce(textMessage(draftJson()));

    await runDriver();

    const task = callsMade()[0]?.params.messages[0]?.content ?? "";
    expect(task).toContain("Evidence:");
    expect(task).not.toContain("The company's card");
    expect(task.toLowerCase()).not.toContain("on the card");
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
    expect(call?.params.system.map((block) => block.text).join("")).toContain(HOW_IT_WINS_FROZEN_WRITER_PROMPT);
    expect(call?.params.messages[0]?.content).toContain("Approved judgment:");
    expect(call?.params.messages[0]?.content).not.toContain("how-it-wins-reason");
  });
});
