import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type Anthropic from "@anthropic-ai/sdk";
import type { Message } from "@anthropic-ai/sdk/resources/messages";
import type { ColdStartCard, HowItWinsRead } from "@cold-start/core";
import { describe, expect, it, vi } from "vitest";

import { HOW_IT_WINS_HOSTILE_EDITOR, HOW_IT_WINS_WRITING_STANDARD } from "../src/how-it-wins-prompts";
import {
  HowItWinsEmptyTextError,
  parseHowItWinsDraft,
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
const repoRoot = resolve(testDir, "../../..");
const promptDir = resolve(repoRoot, "docs/product/design/2026-08-18-moat-read-direction/prompt-test");

const card = JSON.parse(
  readFileSync(resolve(testDir, "fixtures/how-it-wins-irregular.json"), "utf8")
) as ColdStartCard;

type TracedCall = {
  label: string;
  model: string;
  stage: string;
  params: { max_tokens: number; system: Array<{ text: string }>; messages: Array<{ content: string }> };
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
    sentence: "OpenAI and Anthropic name its evaluations inside their own model safety documents.",
    running: [
      {
        strategy: "Hybrid",
        meaning: "The company holds two competences that rarely sit in one team.",
        note: "Irregular runs frontier security research and ships the harness that produces the numbers [e1]. Observed in the launch coverage."
      },
      {
        strategy: "Chokepoint",
        meaning: "The company sits on a step buyers cannot route around.",
        note: "Its evaluations run inside the release path of two frontier labs [e2] [e4]. The same announcement names them again [e2]. That placement is inferred from the customer naming."
      },
      {
        strategy: "Prestige",
        meaning: "Named authorities endorse the work in their own public documents.",
        note: "Sequoia led the round and both labs cite the evaluations by name [e12]. Reported."
      }
    ],
    pair: {
      strategies: ["Hybrid", "Chokepoint"],
      note: "The research and the harness ship together, so a competitor copying the harness still lacks the research that decides what to measure [e1] [e2]. The mechanism is inferred.",
      wrong_if: "A lab publishing its own equivalent harness would make the pair read wrong."
    },
    next: [
      {
        strategy: "Standardization",
        note: "It could publish the harness as a shared standard if a third lab adopted it first [e5]."
      }
    ],
    wrong_if: "A second vendor appearing in the same release notes would change the read."
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
});

describe("parseHowItWinsDraft", () => {
  it("maps strategy names to ids and derives citation ids from the visible markers", () => {
    const parsed = parseHowItWinsDraft(draftJson(), card);

    expect("read" in parsed).toBe(true);
    if (!("read" in parsed) || parsed.read.status !== "read") {
      throw new Error("expected a read");
    }
    expect(parsed.read.running.map((entry) => entry.strategy)).toEqual(["hybrid", "chokepoint", "prestige"]);
    expect(parsed.read.running[0]?.citationIds).toEqual(["e1"]);
    expect(parsed.read.running[1]?.citationIds).toEqual(["e2", "e4"]);
    expect(parsed.read.pair?.strategies).toEqual(["hybrid", "chokepoint"]);
    expect(parsed.read.pair?.citationIds).toEqual(["e1", "e2"]);
    expect(parsed.read.pair?.wrongIf).toBe("A lab publishing its own equivalent harness would make the pair read wrong.");
    expect(parsed.read.next[0]?.strategy).toBe("standardization");
    expect(parsed.read.next[0]?.citationIds).toEqual(["e5"]);
    expect(parsed.read.wrongIf).toBe("A second vendor appearing in the same release notes would change the read.");
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
      read: { status: "nothing_stands_out", sentence: "It competes the way most LLM tooling companies do." }
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
    expect(parsed.issues.join(" ")).toContain("z9");
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
    expect(parsed.issues.join(" ")).toContain("Moat");
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
    expect(parsed.issues.join(" ")).toContain("running");
  });

  it("reports text that is not JSON", () => {
    expect(parseHowItWinsDraft("I could not write this read.", card)).toEqual({
      issues: expect.arrayContaining([expect.any(String)])
    });
  });
});

describe("styleIssuesForRead", () => {
  it("passes a clean read", () => {
    expect(styleIssuesForRead(readFromValidDraft())).toEqual([]);
  });

  it("flags a meaning line that is a fragment", () => {
    const read = readFromValidDraft();
    read.running = read.running.map((entry, index) =>
      index === 0 ? { ...entry, meaning: "Two competences at once" } : entry
    );

    expect(styleIssuesForRead(read).join(" ")).toContain("running[0].meaning");
  });

  it("flags a meaning line under five words", () => {
    const read = readFromValidDraft();
    read.running = read.running.map((entry, index) => (index === 1 ? { ...entry, meaning: "It sits between." } : entry));

    expect(styleIssuesForRead(read).join(" ")).toContain("running[1].meaning");
  });

  it("flags a note that states certainty three times", () => {
    const read = readFromValidDraft();
    read.running = read.running.map((entry, index) =>
      index === 0
        ? { ...entry, note: "Reported by the round coverage [e1]. Observed in the same post. Inferred from both." }
        : entry
    );

    expect(styleIssuesForRead(read).join(" ")).toContain("running[0].note");
  });

  it("flags an em dash anywhere in the read", () => {
    const read = readFromValidDraft();
    read.wrongIf = "A second vendor \u2014 any credible one \u2014 would change the read.";

    expect(styleIssuesForRead(read).join(" ")).toContain("em dash");
  });

  it("flags a sentence that is not a complete sentence", () => {
    const read = readFromValidDraft();
    read.sentence = "It wins";

    expect(styleIssuesForRead(read).join(" ")).toContain("sentence");
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
  it("skips the hostile editor when it fails on something other than transport", async () => {
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
    expect(calls[1]?.params.max_tokens).toBe(24000);
    expect(calls[1]?.label).toBe("how-it-wins-reason");
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
            draft.running = draft.running.map((entry, index) =>
              index === 0 ? { ...entry, meaning: "Two competences at once" } : entry
            );
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
    expect(retry?.params.messages[0]?.content).toContain("running[0].meaning");
    expect(retry?.params.messages[0]?.content).toContain("fix them and return only the JSON");
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
      draft.running = draft.running.map((entry, index) =>
        index === 0 ? { ...entry, meaning: "Two competences at once" } : entry
      );
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
    expect(result.read.running[0]?.meaning).toBe("Two competences at once");
    expect(result.styleIssues.join(" ")).toContain("running[0].meaning");
  });
});
