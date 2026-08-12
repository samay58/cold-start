// Verbatim lens copy asserted directly by tests (investor-read-card.test.tsx,
// sidepanel-ui.spec.ts, lens-gallery.spec.ts). A standalone sibling copy module, not inline in
// InvestorReadCard.tsx, so Playwright's e2e specs can import these constants without pulling in
// InvestorReadCard.tsx's runtime dependency on @cold-start/core: that package's api-contract.ts
// imports api-contract.json without an import assertion, which Vite/vitest accept but
// Playwright's Node ESM test loader rejects ("needs an import attribute of type: json").
// synthesis-advisory-copy.ts sidesteps the same hazard by staying type-only on @cold-start/core;
// this module has no imports at all.
export const LENS_TENSION_EMPTY_COPY = {
  both: "The public evidence does not support a clear case yet.",
  breaks: "The public record does not reveal a specific break point yet.",
  holds: "The public record does not make a clear upside case yet."
} as const;

export const LENS_TENSION_LABEL = {
  breaks: "It breaks if",
  holds: "If true"
} as const;

// The sixth Lens category's flat empty-state copy, one line per state the emphasis read
// can be in when there is nothing to show: too few sources to run the pass (thin_file),
// the model ran and found no loud/quiet asymmetry worth filing (nothing_notable), or the
// card predates this feature and never carries the field at all (legacy, reads as not_read).
export const EMPHASIS_EMPTY_COPY = {
  thinFile: "Not enough filed.",
  nothingNotable: "Nothing notable.",
  notRead: "Not read yet."
} as const;

export const EMPHASIS_LABELS = {
  loud: "Loud",
  quiet: "Quiet",
  read: "The read",
  wouldChangeIf: "Would change if"
} as const;
