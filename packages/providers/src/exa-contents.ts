// The Exa `contents` setting for any search whose results become evidence. Without it Exa returns
// only an id, title and URL, and the stored source holds no page text for any model to read.
export const exaPageTextContents = {
  text: true,
  highlights: { highlightsPerUrl: 2, numSentences: 2 },
} as const;
