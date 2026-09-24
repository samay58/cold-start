// The research plan extraction reads: the company archetype, the questions an investor asks
// first, and what the profile should put forward. Search queries are not part of it; every
// evidence search reads defaultSourceSearchQueries in core.
export type ResearchPlan = {
  companyArchetype: string;
  priorityQuestions: Array<{ question: string; why: string; sourceHint: string }>;
  presentationFocus: string[];
};

export function fallbackResearchPlan(): ResearchPlan {
  return {
    companyArchetype: "private technology company",
    priorityQuestions: [
      {
        question: "What does the company actually sell, and who owns the budget?",
        why: "A precise buyer and workflow matter more than a generic category label.",
        sourceHint: "Homepage, product pages, customer pages, and independent product analysis.",
      },
      {
        question: "Is the market structurally attractive, and why now?",
        why: "Budget ownership, pain severity, adoption trigger, profit pool, and timing matter more than top-down TAM.",
        sourceHint: "Customer pages, independent market analysis, budget-owner content, technical analysis, and industry reporting.",
      },
      {
        question: "What public proof exists beyond company positioning?",
        why: "Customer proof, usage, hiring, and independent analysis separate substance from PR.",
        sourceHint: "Independent reporting, technical analysis, customer pages, hiring pages, and analyst posts.",
      },
      {
        question: "What changed in the latest financing round?",
        why: "Round cadence, lead investor quality, valuation, and use of proceeds reveal the company trajectory.",
        sourceHint: "Recent funding coverage, company announcements, investor posts, and data enrichment.",
      },
    ],
    presentationFocus: ["product and technology", "buyer and use case", "market structure and timing", "source quality", "funding cadence", "public proof gaps"],
  };
}
