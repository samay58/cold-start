import {
  HOW_IT_WINS_STRATEGIES,
  coldStartCardSchema,
  howItWinsStrategyIdForName,
  type ColdStartCard,
  type HowItWinsEvidenceItem
} from "@cold-start/core";

import { cardForHowItWinsPrompt } from "./how-it-wins";
import {
  HOW_IT_WINS_JUDGMENT_STANDARD_TEXT,
  HOW_IT_WINS_STRATEGY_RUBRIC_TEXT
} from "./how-it-wins-judge-spec-text";
import type { HowItWinsJudgeRules } from "./how-it-wins-judge";

function tableCells(line: string) {
  return line.slice(1, -1).split("|").map((cell) => cell.trim());
}

export function parseHowItWinsJudgeRules(input: { standard: string; rubric: string }): HowItWinsJudgeRules {
  const betStart = input.standard.indexOf("## Find the company's actual bet");
  const betEnd = input.standard.indexOf("## Keep claims separate");
  if (betStart < 0 || betEnd <= betStart) throw new Error("could not isolate the authoritative actual-bet rule");

  const rows = input.rubric
    .split("\n")
    .filter((line) => line.startsWith("| ") && !line.startsWith("| ---") && !line.startsWith("| Strategy |"))
    .map(tableCells)
    .filter((cells) => cells.length === 7)
    .map((cells) => {
      const [name, canonicalMeaning, positiveEvidence, falsePositives, nearestSiblings, decidingQuestion, disqualifyingEvidence] = cells;
      const strategyId = howItWinsStrategyIdForName(name!);
      if (!strategyId) throw new Error(`noncanonical rubric strategy: ${name}`);
      return {
        strategyId,
        name: name!,
        canonicalMeaning: canonicalMeaning!,
        positiveEvidence: positiveEvidence!,
        falsePositives: falsePositives!,
        nearestSiblings: nearestSiblings!
          .split(";")
          .map((value) => value.trim().replace(/\.$/, ""))
          .filter(Boolean),
        decidingQuestion: decidingQuestion!,
        disqualifyingEvidence: disqualifyingEvidence!
      };
    });

  const byId = new Map(rows.map((row) => [row.strategyId, row]));
  if (rows.length !== HOW_IT_WINS_STRATEGIES.length || byId.size !== HOW_IT_WINS_STRATEGIES.length) {
    throw new Error(`strategy rubric has ${rows.length} rows and ${byId.size} unique canonical ids`);
  }
  const ordered = HOW_IT_WINS_STRATEGIES.map((strategy) => {
    const row = byId.get(strategy.id);
    if (!row) throw new Error(`strategy rubric is missing ${strategy.id}`);
    if (row.name !== strategy.name || row.canonicalMeaning !== strategy.meaning) {
      throw new Error(`strategy rubric differs from the canonical source for ${strategy.id}`);
    }
    return row;
  });

  return {
    standard: input.standard.trim(),
    actualBetStandard: input.standard.slice(betStart, betEnd).trim(),
    strategyRubric: ordered
  };
}

export function loadHowItWinsJudgeRules(): HowItWinsJudgeRules {
  return parseHowItWinsJudgeRules({
    standard: HOW_IT_WINS_JUDGMENT_STANDARD_TEXT,
    rubric: HOW_IT_WINS_STRATEGY_RUBRIC_TEXT
  });
}

export function howItWinsEvidencePacketFromCard(cardInput: ColdStartCard) {
  const card = coldStartCardSchema.parse(cardInput);
  const context = structuredClone(cardForHowItWinsPrompt(card));
  const evidence: HowItWinsEvidenceItem[] = context.citations.map((citation) => ({
    evidenceId: citation.id,
    text: citation.snippet?.trim() || citation.title,
    source: `${citation.title} (${citation.url})`,
    sourceDate: null,
    attribution: citation.sourceQuality?.tier ?? citation.sourceType,
    scope: "company"
  }));
  return {
    cutoff: card.generatedAt,
    evidence,
    context
  };
}
