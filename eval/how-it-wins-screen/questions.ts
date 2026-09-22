// Builds the layered Jev screen's questions from the approved strategy rubric, so the screen
// asks the rubric's own operational tests instead of a second, drifting judgment standard.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { HOW_IT_WINS_STRATEGIES, type HowItWinsStrategyId } from "@cold-start/core";

// Eval scripts run from the repo root, like the rest of eval/.
export const RUBRIC_PATH = path.resolve(process.cwd(), "docs/superpowers/specs/2026-08-21-how-it-wins-strategy-rubric.md");

export type RubricRow = {
  id: HowItWinsStrategyId;
  name: string;
  meaning: string;
  positive: string;
  falsePositives: string;
  siblings: string;
  deciding: string;
  disqualifying: string;
};

export type NoulQuestion = {
  type: "noul";
  instructions: string;
  criteria?: { true: string; false: string };
};

const EXPECTED_HEADER = [
  "Strategy",
  "Steph's canonical meaning",
  "Positive operational evidence",
  "Common false positives",
  "Nearest siblings",
  "Deciding question",
  "Disqualifying evidence"
];

function cells(line: string): string[] {
  return line.replace(/^\|/, "").replace(/\|\s*$/, "").split("|").map((cell) => cell.trim());
}

export function parseRubric(markdown: string): RubricRow[] {
  const byName = new Map(HOW_IT_WINS_STRATEGIES.map((strategy) => [strategy.name.toLowerCase(), strategy]));
  const rows: RubricRow[] = [];
  for (const line of markdown.split("\n")) {
    if (!line.startsWith("| ") || line.startsWith("| ---")) continue;
    const parts = cells(line);
    if (parts[0] === EXPECTED_HEADER[0]) {
      if (parts.join("|") !== EXPECTED_HEADER.join("|")) throw new Error(`Unexpected rubric header: ${line}`);
      continue;
    }
    if (parts.length !== EXPECTED_HEADER.length) throw new Error(`Rubric row has ${parts.length} cells: ${parts[0]}`);
    const strategy = byName.get(parts[0].toLowerCase());
    if (!strategy) throw new Error(`Rubric names an unknown strategy: ${parts[0]}`);
    // The canonical meaning always comes from core; the rubric column must agree with it.
    if (parts[1] !== strategy.meaning) throw new Error(`Rubric meaning drifted from core for ${strategy.id}`);
    rows.push({
      id: strategy.id,
      name: strategy.name,
      meaning: strategy.meaning,
      positive: parts[2],
      falsePositives: parts[3],
      siblings: parts[4],
      deciding: parts[5],
      disqualifying: parts[6]
    });
  }
  const ids = new Set(rows.map((row) => row.id));
  if (rows.length !== HOW_IT_WINS_STRATEGIES.length || ids.size !== rows.length) {
    throw new Error(`Rubric covers ${ids.size} of ${HOW_IT_WINS_STRATEGIES.length} strategies`);
  }
  return rows;
}

export function loadRubric(): { rows: RubricRow[]; rubricHash: string } {
  const markdown = readFileSync(RUBRIC_PATH, "utf8");
  return { rows: parseRubric(markdown), rubricHash: createHash("sha256").update(markdown).digest("hex") };
}

const EVIDENCE_ONLY = "Judge only from the company evidence in the state. Missing evidence is not evidence against.";

// Round 1 exists to discard strategies with no foothold at all. It is worded to say yes to any hint,
// because a strategy wrongly discarded here never reaches the judge.
export type RoundOneVariant = "hint" | "candidate";

export function roundOneQuestion(row: RubricRow, variant: RoundOneVariant = "candidate"): NoulQuestion {
  if (variant === "candidate") {
    // "Any hint" wording drew yes answers on most strategies; this asks whether an analyst should spend time on it.
    return {
      type: "noul",
      instructions: `Should an analyst examine "${row.name}" (${row.meaning}) as a real explanation of how this company wins? ${row.deciding}`,
      criteria: {
        true: `The evidence contains at least one specific fact of this kind, even if it is not yet conclusive: ${row.positive}`,
        false: `Nothing specific supports it, or the only support is a look-alike: ${row.falsePositives} ${EVIDENCE_ONLY}`
      }
    };
  }
  return {
    type: "noul",
    instructions: `Does anything in the evidence give even a hint that this company could win through "${row.name}" (${row.meaning})?`,
    criteria: {
      true: `At least one fact points toward this, even weakly or indirectly. Examples of what counts: ${row.positive}`,
      false: `Nothing in the evidence points toward this way of winning at all. ${EVIDENCE_ONLY}`
    }
  };
}

export type RoundTwoKey = "deciding" | "positive" | "lookalike" | "disqualifier";

// Round 2 splits the rubric row into four narrow checks. "deciding" and "positive" are two wordings of the
// same judgment; code treats their disagreement as a signal that the strategy is vague for this company.
export function roundTwoQuestions(row: RubricRow): Record<RoundTwoKey, NoulQuestion> {
  return {
    deciding: {
      type: "noul",
      instructions: `${row.deciding} Answer for this company about "${row.name}" (${row.meaning}). ${EVIDENCE_ONLY}`
    },
    positive: {
      type: "noul",
      instructions: `The evidence shows this for the company, concretely rather than as a claim or aspiration: ${row.positive}`,
      criteria: {
        true: "A specific fact in the evidence shows it: a named customer, number, product behavior, outcome or comparison",
        false: "The evidence does not show it, or shows it only as marketing language, a plan or a vague claim"
      }
    },
    lookalike: {
      type: "noul",
      instructions: `The only evidence that seems to support "${row.name}" for this company is one of these look-alikes, which do not count: ${row.falsePositives}`,
      criteria: {
        true: "Everything that seems to support it is one of the listed look-alikes",
        false: "At least one piece of support goes beyond the look-alikes, or nothing supports it at all"
      }
    },
    disqualifier: {
      type: "noul",
      instructions: `The evidence affirmatively shows this about the company: ${row.disqualifying}`,
      criteria: {
        true: "A specific fact in the evidence shows it",
        false: "The evidence does not show it; silence does not count"
      }
    }
  };
}
