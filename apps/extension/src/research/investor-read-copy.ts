// Verbatim lens copy asserted directly by tests (investor-read-card.test.tsx,
// sidepanel-ui.spec.ts, lens-gallery.spec.ts). A standalone sibling copy module, not inline in
// InvestorReadCard.tsx, so Playwright's e2e specs can import these constants without pulling in
// InvestorReadCard.tsx's runtime dependency on @cold-start/core: that package's api-contract.ts
// imports api-contract.json without an import assertion, which Vite/vitest accept but
// Playwright's Node ESM test loader rejects ("needs an import attribute of type: json").
// synthesis-advisory-copy.ts sidesteps the same hazard by staying type-only on @cold-start/core;
// this module has no imports at all.
export const LENS_TENSION_EMPTY_COPY = {
  breaks: "The public record does not reveal a specific break point yet.",
  holds: "The public record does not make a clear upside case yet."
} as const;

// Both sides of The case sit in one body, so the labels name the position rather than the
// conditional it used to open ("If true" / "It breaks if").
export const LENS_CASE_LABEL = {
  breaks: "Bear",
  holds: "Bull"
} as const;

// The How it wins crown's copy. The count reads against the full vocabulary so a filed read
// stays honestly small: three of eighty, not "three strategies".
export const HOW_IT_WINS_COPY = {
  label: "How it wins",
  count: (n: number) => `${n} of 80 strategies`,
  notYet: "not yet",
  wrongIf: "Wrong if",
  pinned: "pinned",
  thinFile: "Not enough filed.",
  nothingStandsOut: "Nothing stands out yet."
} as const;

// The Pay attention to category's flat empty-state copy, one line per state the emphasis read
// can be in when there is nothing to show: too few sources to run the pass (thin_file),
// the model ran and found no loud/quiet asymmetry worth filing (nothing_notable), or the
// card predates this feature and never carries the field at all (legacy, reads as not_read).
export const EMPHASIS_EMPTY_COPY = {
  thinFile: "Not enough filed.",
  nothingNotable: "Nothing notable.",
  notRead: "Not read yet."
} as const;

export const EMPHASIS_LABELS = {
  loud: "Leads with",
  quiet: "Unsaid",
  read: "The read",
  wouldChangeIf: "Would change if"
} as const;
