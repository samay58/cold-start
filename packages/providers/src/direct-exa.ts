import type { DirectExaEnv, ProviderSource, RetrievalIntent } from "./types";

const defaultExaBaseUrl = "https://api.exa.ai";

export type DirectExaProbeName =
  | "exa_direct_company"
  | "exa_direct_people"
  | "exa_direct_funding"
  | "exa_direct_news";

export type DirectExaRequest = {
  name: DirectExaProbeName;
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
};

export type DirectExaFailure = {
  name: DirectExaProbeName;
  endpointUrl: string;
  error: string;
};

export type DirectExaSourcesResult = {
  sources: ProviderSource[];
  failures: DirectExaFailure[];
  skipped: boolean;
};

type FetchJson = (request: DirectExaRequest) => Promise<unknown>;

export function missingDirectExaConfig(env: DirectExaEnv): string[] {
  return env.DIRECT_EXA_API_KEY?.trim() ? [] : ["DIRECT_EXA_API_KEY"];
}

export function buildDirectExaFundamentalsRequests(env: DirectExaEnv, domain: string): DirectExaRequest[] {
  const apiKey = env.DIRECT_EXA_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Missing direct Exa config: DIRECT_EXA_API_KEY");
  }

  const url = `${(env.DIRECT_EXA_BASE_URL?.trim() || defaultExaBaseUrl).replace(/\/+$/, "")}/search`;
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  const contents = {
    text: true,
    highlights: { highlightsPerUrl: 2, numSentences: 2 },
  };

  return [
    {
      name: "exa_direct_company",
      url,
      headers,
      body: {
        query: `${domain} company profile domain headquarters founded what does the company do`,
        type: "instant",
        category: "company",
        numResults: 5,
        contents,
      },
    },
    {
      name: "exa_direct_people",
      url,
      headers,
      body: {
        query: `${domain} founders CEO management team executives leadership`,
        type: "instant",
        category: "people",
        numResults: 6,
        contents,
      },
    },
    {
      name: "exa_direct_funding",
      url,
      headers,
      body: {
        query: `${domain} funding rounds investors total raised valuation latest round`,
        type: "fast",
        category: "news",
        numResults: 8,
        contents,
      },
    },
    {
      name: "exa_direct_news",
      url,
      headers,
      body: {
        query: `${domain} recent launch hiring customers product news`,
        type: "fast",
        category: "news",
        numResults: 6,
        contents: {
          ...contents,
          livecrawl: "fallback",
          maxAgeHours: 24 * 90,
        },
      },
    },
  ];
}

export async function fetchDirectExaFundamentalsSources(input: {
  env: DirectExaEnv;
  domain: string;
  fetchJson?: FetchJson;
}): Promise<DirectExaSourcesResult> {
  if (missingDirectExaConfig(input.env).length > 0) {
    return { sources: [], failures: [], skipped: true };
  }

  const fetchJson = input.fetchJson ?? directExaJson;
  const requests = buildDirectExaFundamentalsRequests(input.env, input.domain);
  const settled = await Promise.allSettled(
    requests.map(async (request) => ({
      request,
      payload: await fetchJson(request),
    }))
  );

  return {
    skipped: false,
    sources: settled.flatMap((result) => {
      if (result.status !== "fulfilled") {
        return [];
      }

      return providerSourcesFromDirectExa(result.value.request, result.value.payload, input.domain);
    }),
    failures: settled.flatMap((result, index) => {
      if (result.status === "fulfilled") {
        return [];
      }

      const request = requests[index];
      if (!request) {
        return [];
      }

      return [
        {
          name: request.name,
          endpointUrl: request.url,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        },
      ];
    }),
  };
}

async function directExaJson(request: DirectExaRequest): Promise<unknown> {
  const response = await fetch(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify(request.body),
  });

  if (!response.ok) {
    throw new Error(`Direct Exa request failed with ${response.status}`);
  }

  return response.json() as Promise<unknown>;
}

function providerSourcesFromDirectExa(request: DirectExaRequest, payload: unknown, domain: string): ProviderSource[] {
  const intent = intentForProbe(request.name);
  const records = extractUrlRecords(payload);

  if (records.length === 0) {
    return [
      providerSourceFromText({
        url: `direct-exa:${request.name}`,
        title: request.name,
        sourceType: "enrichment",
        rawText: JSON.stringify(payload),
        intent,
      }),
    ];
  }

  return records.map((record) => {
    const url = stringRecordValue(record, "url") ?? `direct-exa:${request.name}`;
    const publishedAt = stringRecordValue(record, "publishedDate") ?? stringRecordValue(record, "publishedAt");

    return providerSourceFromText({
      url,
      title: stringRecordValue(record, "title") ?? stringRecordValue(record, "name") ?? url,
      sourceType: sourceTypeForDirectUrl(url, domain),
      rawText: JSON.stringify(record),
      intent,
      ...(publishedAt ? { publishedAt } : {}),
    });
  });
}

function sourceTypeForDirectUrl(url: string, domain: string): ProviderSource["sourceType"] {
  try {
    const host = new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
    const normalizedDomain = domain.replace(/^www\./i, "").toLowerCase();
    if (host === normalizedDomain || host.endsWith(`.${normalizedDomain}`)) {
      return "company_site";
    }
  } catch {
    return "news";
  }

  return "news";
}

function providerSourceFromText(input: {
  url: string;
  title: string;
  sourceType: ProviderSource["sourceType"];
  rawText: string;
  intent: RetrievalIntent;
  publishedAt?: string;
}): ProviderSource {
  return {
    ...input,
    fetchedAt: new Date().toISOString(),
  };
}

function intentForProbe(name: DirectExaProbeName): RetrievalIntent {
  switch (name) {
    case "exa_direct_company":
      return "company_profile";
    case "exa_direct_people":
      return "management_team";
    case "exa_direct_funding":
      return "funding";
    case "exa_direct_news":
      return "recent_signals";
  }
}

function extractUrlRecords(payload: unknown): Record<string, unknown>[] {
  const records: Record<string, unknown>[] = [];
  const seen = new Set<unknown>();

  function visit(value: unknown) {
    if (!value || typeof value !== "object" || seen.has(value)) {
      return;
    }

    seen.add(value);

    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    const record = value as Record<string, unknown>;
    if (typeof record.url === "string" && record.url.startsWith("http")) {
      records.push(record);
      return;
    }

    Object.values(record).forEach(visit);
  }

  visit(payload);
  return dedupeRecordsByUrl(records);
}

function dedupeRecordsByUrl(records: Record<string, unknown>[]) {
  const byUrl = new Map<string, Record<string, unknown>>();
  for (const record of records) {
    const url = stringRecordValue(record, "url");
    if (url && !byUrl.has(url)) {
      byUrl.set(url, record);
    }
  }
  return Array.from(byUrl.values());
}

function stringRecordValue(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}
