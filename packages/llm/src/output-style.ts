// Deterministic wording checks for the research-section and synthesis stages. The prompts already
// forbid these phrases; the check exists because the prompt rule alone did not hold (11 of 82
// research items still said "the evidence" on September 22, 2026). A hit triggers one re-ask with
// the issues listed, the same way styleIssuesForRead drives the How it wins writer's single retry.

type PhraseRule = { phrase: string; pattern: RegExp };

// Phrases that talk about the model's input instead of the company. "the card" and "the packet"
// only match as whole words, so "the cardholder" passes; "the card network" would still trip a
// retry, which costs one call and never blocks output.
const INPUT_REFERENCE_RULES: PhraseRule[] = [
  { phrase: "supplied evidence", pattern: /\bsupplied evidence\b/i },
  { phrase: "the evidence", pattern: /\bthe evidence\b/i },
  { phrase: "the sources supplied", pattern: /\bthe sources supplied\b/i },
  { phrase: "the supplied sources", pattern: /\bthe supplied sources\b/i },
  { phrase: "the card", pattern: /\bthe card\b(?!holder)/i },
  { phrase: "the packet", pattern: /\bthe packet\b/i }
];

// Investor jargon synthesis still leaks into open questions and their change lines.
const SYNTHESIS_JARGON_RULES: PhraseRule[] = [
  { phrase: "thesis", pattern: /\btheses\b|\bthesis\b/i },
  { phrase: "validate", pattern: /\bvalidat(?:e|es|ed|ing|ion)\b/i },
  { phrase: "bull case", pattern: /\bbull case\b/i },
  { phrase: "bear case", pattern: /\bbear case\b/i }
];

function issuesFor(rules: PhraseRule[], value: string | null | undefined, where: string, fix: string): string[] {
  if (!value) return [];
  return rules.filter((rule) => rule.pattern.test(value)).map((rule) => `${where} says "${rule.phrase}"; ${fix}`);
}

const INPUT_REFERENCE_FIX = "say what the source said, or state the gap as a plain fact";
const JARGON_FIX = "use plain words";

export function researchSectionStyleIssues(content: {
  summary: string | null;
  items: Array<{ label: string; text: string }>;
}): string[] {
  return [
    ...issuesFor(INPUT_REFERENCE_RULES, content.summary, "the summary", INPUT_REFERENCE_FIX),
    ...content.items.flatMap((item, index) => [
      ...issuesFor(INPUT_REFERENCE_RULES, item.label, `item ${index + 1}'s label`, INPUT_REFERENCE_FIX),
      ...issuesFor(INPUT_REFERENCE_RULES, item.text, `item ${index + 1}`, INPUT_REFERENCE_FIX)
    ])
  ];
}

export function synthesisStyleIssues(synthesis: {
  openQuestions: Array<{ question: string; wouldChangeReadIf?: string | null | undefined }>;
}): string[] {
  return synthesis.openQuestions.flatMap((question, index) => [
    ...issuesFor(SYNTHESIS_JARGON_RULES, question.question, `open question ${index + 1}`, JARGON_FIX),
    ...issuesFor(SYNTHESIS_JARGON_RULES, question.wouldChangeReadIf, `open question ${index + 1}'s wouldChangeReadIf`, JARGON_FIX)
  ]);
}

export function styleRetryNote(issues: string[]): string {
  return `The previous attempt had these wording problems; fix them and change nothing else:\n- ${issues.join("\n- ")}`;
}

// Runs once, and re-asks once when the output has wording issues. The retry is kept only when it
// succeeds with fewer issues; a failed or worse retry falls back to the first output, so the check
// can never turn a good-enough answer into an error.
export async function withStyleRetry<T>(
  run: (issues?: string[]) => Promise<T>,
  styleIssues: (output: T) => string[]
): Promise<T> {
  const first = await run();
  const issues = styleIssues(first);
  if (issues.length === 0) return first;
  try {
    const second = await run(issues);
    return styleIssues(second).length < issues.length ? second : first;
  } catch {
    return first;
  }
}
