import { sourceSearchSubjectForDomain } from "./source-target";

// The default query for each evidence search. Only the funding search asks about funding: funding
// words in the other queries pulled funding news into evidence meant to show what the company does.
export function defaultSourceSearchQueries(domain: string) {
  const subject = sourceSearchSubjectForDomain(domain);
  return {
    funding: `${subject} funding history latest round valuation investors total raised`,
    companyProfile: `${subject} product customers buyer workflow what does the company do`,
    managementTeam: `${subject} founders CEO management team leadership contact email`,
    recentSignals: `${subject} recent launch customers hiring product partnership`,
    comparables: `${subject} competitors alternatives similar companies market map`,
    independentAnalysis: `${subject} independent analysis technical deep dive market structure buyer budget timing`,
    customerProof: `${subject} customer case study deployment results rollout named customer in production`,
    productProof: `${subject} technical documentation github repository benchmark API architecture how it works`,
  };
}
