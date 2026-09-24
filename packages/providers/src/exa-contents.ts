// The Exa `contents` setting for any search whose results become evidence. Without it Exa returns
// only an id, title and URL, and the stored source holds no page text for any model to read.
//
// Page text is capped at 20,000 characters. Models read at most 2,200 characters of a source
// outside person reads, and person reads look for a name anywhere in the page. On the 12 rebuilt
// cards of September 2026 this cap kept 200 of 206 person-read items identical, and it cut the
// largest stored row from 336 KB to 53 KB and the largest card's sources from 1.6 MB to 1.1 MB.
// Every stored source for a card passes through Inngest's load-sources steps, whose output limit
// is 4 MiB. Exa's `/contents` reference takes `text.maxCharacters` from 1 to 1,000,000.
export const exaPageTextContents = {
  text: { maxCharacters: 20_000 },
  highlights: { highlightsPerUrl: 2, numSentences: 2 },
} as const;
