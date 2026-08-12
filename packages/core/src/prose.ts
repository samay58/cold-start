/*
 * Bubble-text prose gate. The extension shows source titles and snippet
 * sentences inside clippings; the snippet pipeline is a raw slice of
 * sources.raw_text, which for most providers is a JSON envelope, so
 * without a gate a bubble renders JSON. One question, answered
 * conservatively: is this string readable prose? Bias toward rejection.
 * A domain-plus-type bubble is never embarrassing; JSON in a bubble
 * always is. Shared in core because any surface that renders source
 * text needs the same answer.
 */

const STRUCTURAL_OPENER = /^\s*(?:[{[<]|#{2,}\s|!\[|https?:\/\/)/i;
const JSON_KEY = /"[^"\n]{1,80}"\s*:/;
const MARKUP_TAG = /<\/?[a-z][a-z0-9-]*(?:\s[^>]*)?>/i;
const MARKDOWN_LINK = /\]\(|!\[/;
const URL_ENCODED_RUN = /%[0-9a-f]{2}%[0-9a-f]{2}/i;
const QUERY_PAIR_RUN = /[a-z0-9_]+=[^&\s]*&[a-z0-9_]+=/i;
const CODE_SIGNAL = /(?:=>|;\s*\}|\{\s*\}|\\n|\\u[0-9a-f]{4}|```)/i;

export function isReadableProse(value: string): boolean {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) {
    return false;
  }
  if (
    STRUCTURAL_OPENER.test(text) ||
    JSON_KEY.test(text) ||
    MARKUP_TAG.test(text) ||
    MARKDOWN_LINK.test(text) ||
    URL_ENCODED_RUN.test(text) ||
    QUERY_PAIR_RUN.test(text) ||
    CODE_SIGNAL.test(text)
  ) {
    return false;
  }
  // Structure characters that prose never accumulates. Pipes stay out of
  // this set: real titles separate with them ("Product | Company").
  const structural = (text.match(/[{}[\]<>`~^]/g) ?? []).length;
  if (structural >= 3 || (structural > 0 && structural / text.length > 0.02)) {
    return false;
  }
  // Letters must carry the string; identifiers, urls, and number soup fail.
  const letters = (text.match(/[a-z]/gi) ?? []).length;
  return letters / text.length >= 0.55;
}
