// Verbatim lens copy asserted directly by tests (investor-read-card.test.tsx,
// sidepanel-ui.spec.ts, lens-gallery.spec.ts). A standalone sibling copy module, not inline in
// InvestorReadCard.tsx, so Playwright's e2e specs can import these constants without pulling in
// InvestorReadCard.tsx's runtime dependency on @cold-start/core: that package's api-contract.ts
// imports api-contract.json without an import assertion, which Vite/vitest accept but
// Playwright's Node ESM test loader rejects ("needs an import attribute of type: json").
// synthesis-advisory-copy.ts sidesteps the same hazard by staying type-only on @cold-start/core;
// this module has no imports at all.
export const LENS_TENSION_EMPTY_COPY = {
  both: "No bull or break claim survived verification.",
  breaks: "No breaking claim survived verification.",
  holds: "No supporting claim survived verification."
} as const;

export const LENS_TENSION_LABEL = {
  breaks: "It breaks if",
  holds: "If true"
} as const;
