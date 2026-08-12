import { fetchDirectExaRequests } from "../direct-exa";
import type { DirectExaRequest } from "../direct-exa";
import type { DirectExaEnv } from "../types";
import { capText } from "./types";
import type { FounderVoiceItem, FounderVoiceLaneResult, FounderVoiceTargets } from "./types";

/*
 * Paid lane over Direct Exa's /search endpoint, looking for third-party coverage of the
 * founders (interviews, profiles, blog write-ups) rather than the founders' own words:
 * the xai-x-search lane already owns founders' own posts. This lane never builds an
 * X/tweet-shaped query on Exa; its tweet coverage is empirically dead.
 */

const LANE = "exa_founder_web" as const;
const DEFAULT_EXA_BASE_URL = "https://api.exa.ai";

export async function fetchExaWebLane(input: {
  targets: FounderVoiceTargets;
  directExaEnv: DirectExaEnv;
  timeoutMs: number;
}): Promise<FounderVoiceLaneResult> {
  try {
    const apiKey = input.directExaEnv.DIRECT_EXA_API_KEY?.trim();
    if (!apiKey) {
      return { lane: LANE, items: [], estimatedCostUsd: 0 };
    }

    const requests = founderWebRequests(input.directExaEnv, apiKey, input.targets);
    const result = await fetchDirectExaRequests({
      env: input.directExaEnv,
      domain: input.targets.domain,
      requests,
      timeoutMs: input.timeoutMs,
    });

    const items: FounderVoiceItem[] = result.sources.map((source) => {
      const text = capText(textFromRawRecord(source.rawText) || source.title);
      return {
        lane: LANE,
        url: source.url,
        title: capText(source.title),
        text,
        // Interviews and profiles are coverage about the founders, not posts by them;
        // only a hit that actually lands on the company's own domain counts as company
        // voice (e.g. the company's own blog carrying a founder's words verbatim).
        authorship: source.sourceType === "company_site" ? "company" : "third_party",
        ...(source.publishedAt ? { publishedAt: source.publishedAt } : {}),
      };
    });

    return {
      lane: LANE,
      items,
      estimatedCostUsd: result.estimatedCostUsd,
      ...(result.failures.length > 0
        ? { failure: result.failures.map((failure) => `${failure.name}: ${failure.error}`).join("; ") }
        : {}),
    };
  } catch (error) {
    return { lane: LANE, items: [], estimatedCostUsd: 0, failure: error instanceof Error ? error.message : String(error) };
  }
}

function founderWebRequests(env: DirectExaEnv, apiKey: string, targets: FounderVoiceTargets): DirectExaRequest[] {
  const url = `${(env.DIRECT_EXA_BASE_URL?.trim() || DEFAULT_EXA_BASE_URL).replace(/\/+$/, "")}/search`;
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
  const contents = { text: true, highlights: { highlightsPerUrl: 2, numSentences: 2 } };

  const requests: DirectExaRequest[] = [
    {
      name: "exa_direct_founder_web",
      url,
      headers,
      body: {
        query: `"${targets.companyName}" founder interview OR blog OR substack`,
        type: "fast",
        numResults: 6,
        contents,
      },
    },
  ];

  const firstFounder = targets.founders[0];
  if (firstFounder && firstFounder.name.trim().length > 0) {
    requests.push({
      name: "exa_direct_founder_web",
      url,
      headers,
      body: {
        query: `"${firstFounder.name}" "${targets.companyName}"`,
        type: "fast",
        numResults: 6,
        contents,
      },
    });
  }

  return requests;
}

// source.rawText is JSON.stringify(record) of the original Exa result (see
// providerSourcesFromDirectExa in direct-exa.ts); reparse it to recover clean prose
// instead of showing the caller a raw JSON blob as "text".
function textFromRawRecord(rawText: string): string {
  try {
    const record = JSON.parse(rawText) as Record<string, unknown>;
    if (typeof record.text === "string" && record.text.trim().length > 0) {
      return record.text;
    }
    if (Array.isArray(record.highlights)) {
      const joined = record.highlights.filter((part): part is string => typeof part === "string").join(" ");
      if (joined.trim().length > 0) {
        return joined;
      }
    }
    return "";
  } catch {
    return "";
  }
}
