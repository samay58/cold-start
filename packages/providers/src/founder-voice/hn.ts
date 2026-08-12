import { capText } from "./types";
import type { FounderVoiceItem, FounderVoiceLaneResult, FounderVoiceTargets } from "./types";

/*
 * Free, no-auth lane over the HN Algolia search API. The product spec frames this lane
 * as "founder HN activity by author," but founder HN usernames are not on the card and
 * there is no reliable public directory to resolve name to handle. This v1 reads the
 * company's HN footprint instead: stories about the target domain, and the company's own
 * Show HN posts. Resolving real founder handles is a follow-on, tracked in the plan.
 */

const HN_SEARCH_URL = "https://hn.algolia.com/api/v1/search";

type HnHit = {
  objectID?: string;
  title?: string | null;
  url?: string | null;
  created_at?: string | null;
  story_text?: string | null;
};

type HnSearchResponse = {
  hits?: HnHit[];
};

export async function fetchHnLane(input: {
  targets: FounderVoiceTargets;
  timeoutMs: number;
  fetchFn?: typeof fetch;
}): Promise<FounderVoiceLaneResult> {
  const fetchFn = input.fetchFn ?? fetch;
  const lane = "hn_search" as const;

  try {
    const domainUrl = hnSearchUrl(`"${input.targets.domain}"`);
    const showHnUrl = hnSearchUrl(`"Show HN ${input.targets.companyName}"`);

    const [domainPayload, showHnPayload] = await Promise.all([
      fetchHnSearch(fetchFn, domainUrl, input.timeoutMs),
      fetchHnSearch(fetchFn, showHnUrl, input.timeoutMs),
    ]);

    const items: FounderVoiceItem[] = [];
    const seen = new Set<string>();

    for (const hit of [...(domainPayload.hits ?? []), ...(showHnPayload.hits ?? [])]) {
      if (!hit.objectID || seen.has(hit.objectID)) {
        continue;
      }
      seen.add(hit.objectID);

      const title = capText(hit.title ?? "");
      const url = hit.url ?? `https://news.ycombinator.com/item?id=${hit.objectID}`;
      const isShowHn = title.toLowerCase().startsWith("show hn");
      const isCompanyDomain = hostnameMatchesDomain(hit.url, input.targets.domain);

      items.push({
        lane,
        url,
        title,
        text: capText(hit.story_text ?? hit.title ?? ""),
        authorship: isShowHn || isCompanyDomain ? "company" : "third_party",
        ...(hit.created_at ? { publishedAt: hit.created_at } : {}),
      });
    }

    return { lane, items, estimatedCostUsd: 0 };
  } catch (error) {
    return { lane, items: [], estimatedCostUsd: 0, failure: error instanceof Error ? error.message : String(error) };
  }
}

function hnSearchUrl(query: string): string {
  return `${HN_SEARCH_URL}?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=10`;
}

async function fetchHnSearch(fetchFn: typeof fetch, url: string, timeoutMs: number): Promise<HnSearchResponse> {
  const response = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) {
    throw new Error(`HN Algolia search failed with ${response.status}`);
  }
  return (await response.json()) as HnSearchResponse;
}

function hostnameMatchesDomain(url: string | null | undefined, domain: string): boolean {
  if (!url) {
    return false;
  }
  try {
    const hostname = new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
    const normalizedDomain = domain.replace(/^www\./i, "").toLowerCase();
    return hostname === normalizedDomain || hostname.endsWith(`.${normalizedDomain}`);
  } catch {
    return false;
  }
}
