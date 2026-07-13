/*
 * Abbreviation-aware sentence splitting shared by description normalization
 * (this package), extraction normalization, person-read validation, and the
 * extension's profile summary formatting. Those surfaces used to carry their
 * own near-identical "split on [.!?] followed by whitespace" regexes, which
 * treat every abbreviation period (Washington D.C., Acme Inc.) and every
 * mid-sentence label as a sentence boundary; this is the one canonical home
 * so callers cannot drift back into that bug.
 *
 * Bias: when a punctuation mark's status as a sentence boundary is
 * ambiguous, do NOT split there. Under-splitting just leaves two sentences
 * joined, which callers already handle (they take up to N sentences, or
 * render the joined text as-is). Over-splitting truncates a real sentence
 * mid-thought, which is the bug this module exists to kill. Two ambiguity
 * signals are checked before a period is treated as terminal:
 *   1. The word ending at the period is a known abbreviation (D.C., U.S.,
 *      U.K., Inc., Corp., Co., Ltd., St., Dr., Jr., Sr., No., vs., e.g., i.e.).
 *   2. The next non-space character after the punctuation is a lowercase
 *      letter, which no legitimate new sentence in this domain starts with.
 * Decimal points ($6.2M, 3.5x) never reach the boundary check at all: a
 * period is only a boundary candidate when it is immediately followed by
 * whitespace or end-of-string, and a decimal point is always immediately
 * followed by another digit.
 */

const SENTENCE_ABBREVIATIONS = new Set([
  "d.c.",
  "u.s.",
  "u.k.",
  "inc.",
  "corp.",
  "co.",
  "ltd.",
  "st.",
  "dr.",
  "jr.",
  "sr.",
  "no.",
  "vs.",
  "e.g.",
  "i.e.",
]);

// A run of sentence-ending punctuation immediately followed by whitespace or
// end-of-string. Requiring the trailing whitespace/end is what keeps decimal
// points (always followed by another digit) out of consideration entirely.
const BOUNDARY_PATTERN = /[.!?]+(?=\s|$)/g;

function isWhitespace(char: string | undefined): boolean {
  return typeof char === "string" && /\s/.test(char);
}

function precedingWord(text: string, boundaryStart: number): string {
  let start = boundaryStart;
  while (start > 0 && !isWhitespace(text[start - 1])) {
    start -= 1;
  }
  return text.slice(start, boundaryStart);
}

function isKnownAbbreviation(text: string, matchStart: number, punctuation: string): boolean {
  if (punctuation !== ".") {
    // Runs ending in "!" or "?" (including mixed runs like "?!") are never
    // abbreviations; only a lone terminal period needs the abbreviation check.
    return false;
  }

  const word = `${precedingWord(text, matchStart)}${punctuation}`;
  return SENTENCE_ABBREVIATIONS.has(word.toLowerCase());
}

function nextNonSpaceStartsLowercase(text: string, index: number): boolean {
  let cursor = index;
  while (cursor < text.length && isWhitespace(text[cursor])) {
    cursor += 1;
  }
  const char = text[cursor];
  return typeof char === "string" && /[a-z]/.test(char);
}

export function splitIntoSentences(value: string): string[] {
  const text = value.trim();
  if (!text) {
    return [];
  }

  const sentences: string[] = [];
  let cursor = 0;
  BOUNDARY_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = BOUNDARY_PATTERN.exec(text))) {
    const punctuation = match[0];
    const matchStart = match.index;
    const matchEnd = matchStart + punctuation.length;

    if (isKnownAbbreviation(text, matchStart, punctuation) || nextNonSpaceStartsLowercase(text, matchEnd)) {
      continue;
    }

    const sentence = text.slice(cursor, matchEnd).trim();
    if (sentence) {
      sentences.push(sentence);
    }
    cursor = matchEnd;
  }

  const remainder = text.slice(cursor).trim();
  if (remainder) {
    sentences.push(remainder);
  }

  return sentences;
}

export function firstSentence(value: string): string {
  const [first] = splitIntoSentences(value);
  return first ?? value.trim();
}

export function takeSentences(value: string, limit: number): string[] {
  return splitIntoSentences(value).slice(0, Math.max(0, limit));
}

export function sentenceCount(value: string): number {
  return splitIntoSentences(value).length;
}
