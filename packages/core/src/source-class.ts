/*
 * Shared text heuristics for bucketing a source by what it looks like (docs,
 * funding coverage, customer proof). First Payoff (core) and the extension's
 * research-progress copy used to carry their own near-identical regexes; this is
 * the one canonical home so they cannot drift. Callers build the text to scan
 * from whatever fields they have (url, title, snippet, intent); these predicates
 * just match, case-insensitively.
 */
const DOCS_PATTERN = /\bdocs?\b|documentation|developer|\bapi\b|quickstart|guide/;
const FUNDING_PATTERN = /\bfunding\b|\braised\b|series [a-z]\b|\bround\b|\binvestors?\b|\bvaluation\b/;
const CUSTOMER_PROOF_PATTERN = /\bcustomer\b|\bcustomers\b|\bcase study\b|\bdeploy(?:s|ed|ment)\b/;

export function textLooksLikeDocs(text: string): boolean {
  return DOCS_PATTERN.test(text.toLowerCase());
}

export function textLooksLikeFunding(text: string): boolean {
  return FUNDING_PATTERN.test(text.toLowerCase());
}

export function textLooksLikeCustomerProof(text: string): boolean {
  return CUSTOMER_PROOF_PATTERN.test(text.toLowerCase());
}
