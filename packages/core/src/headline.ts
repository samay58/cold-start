// Headline classification for the extension's First Read slip, kept behind a single tested
// boundary in core so the regex and entity match are not redefined inside a render path and
// cannot be quietly broadened. The heuristic still runs client-side in the extension: the slip
// reads live source titles during the seed window, before any LLM extraction has landed, so the
// classifier has to live where that read happens. Centralizing it does not move it server-side;
// it removes the duplication and pins the regex with a test.

// Headline-shaped titles surfaced as proof straight from a source title. Matches funding, launch,
// and M&A language, not a company's homepage tagline. Do not broaden this set: every added term
// widens what the slip will surface unverified, so any addition needs its own evidence and test.
export const newsworthyTitlePattern = /\b(raise[sd]?|raising|funding|seed|series\s+[a-z]\b|round|\$[\d.]|\d+\s*(?:m|mn|million|b|bn|billion)\b|backed by|valuation|valued at|acqui(?:re[sd]?|sition)|launch(?:e[sd])?|unveil[sed]*|announce[sd]?|partner(?:s|ed)?\s+with|going public|ipo)\b/i;

// A surfaced headline must actually name the company, so a mismatched aggregator headline
// ("Acme raises $50M Series C") is never attributed to the company being researched. Matches on
// the company name or the domain root, each gated at three characters to avoid spurious hits.
export function titleMentionsCompany(title: string, company: { name?: string | null; domain: string }): boolean {
  const haystack = title.toLowerCase();
  const name = company.name?.trim().toLowerCase();
  const root = company.domain.replace(/^www\./i, "").split(".")[0]?.toLowerCase() ?? "";
  return Boolean((name && name.length >= 3 && haystack.includes(name)) || (root.length >= 3 && haystack.includes(root)));
}
