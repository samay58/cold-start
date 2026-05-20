import { normalizeNamedPeopleEmailHints, type NamedPeopleEmailHint } from "./people-hints";
import type { DirectExaEnv, PeopleEmailHint, ProviderFactCandidate, ProviderSource, RetrievalIntent } from "./types";

const defaultExaBaseUrl = "https://api.exa.ai";

export type DirectExaProbeName =
  | "exa_direct_company"
  | "exa_direct_people"
  | "exa_direct_funding"
  | "exa_direct_news"
  | "exa_direct_contact_email";

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

export type DirectExaContactSourcesResult = DirectExaSourcesResult & {
  facts: ProviderFactCandidate[];
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

export function buildDirectExaContactRequests(
  env: DirectExaEnv,
  domain: string,
  peopleHints: PeopleEmailHint[],
): DirectExaRequest[] {
  const apiKey = env.DIRECT_EXA_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Missing direct Exa config: DIRECT_EXA_API_KEY");
  }

  const people = normalizeNamedPeopleEmailHints(peopleHints).slice(0, 6);
  if (people.length === 0) {
    return [];
  }

  const url = `${(env.DIRECT_EXA_BASE_URL?.trim() || defaultExaBaseUrl).replace(/\/+$/, "")}/search`;
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  const names = people.map((person) => `"${person.name}"`).join(" OR ");

  return [
    {
      name: "exa_direct_contact_email",
      url,
      headers,
      body: {
        query: `(${names}) "${domain}" work email "@${domain}"`,
        type: "fast",
        numResults: 10,
        contents: {
          text: true,
          highlights: { highlightsPerUrl: 3, numSentences: 2 },
          livecrawl: "fallback",
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

export async function fetchDirectExaContactSources(input: {
  env: DirectExaEnv;
  domain: string;
  peopleHints: PeopleEmailHint[];
  fetchJson?: FetchJson;
}): Promise<DirectExaContactSourcesResult> {
  if (missingDirectExaConfig(input.env).length > 0) {
    return { sources: [], facts: [], failures: [], skipped: true };
  }

  const peopleHints = normalizeNamedPeopleEmailHints(input.peopleHints);
  if (peopleHints.length === 0) {
    return { sources: [], facts: [], failures: [], skipped: true };
  }

  const fetchJson = input.fetchJson ?? directExaJson;
  const requests = buildDirectExaContactRequests(input.env, input.domain, peopleHints);
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
    facts: settled.flatMap((result) => {
      if (result.status !== "fulfilled") {
        return [];
      }

      return contactEmailFactsFromDirectExa(result.value.request, result.value.payload, input.domain, peopleHints);
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
    case "exa_direct_contact_email":
      return "email_verification";
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

function contactEmailFactsFromDirectExa(
  request: DirectExaRequest,
  payload: unknown,
  domain: string,
  peopleHints: NamedPeopleEmailHint[],
): ProviderFactCandidate[] {
  const facts: ProviderFactCandidate[] = [];
  const seen = new Set<string>();

  for (const record of extractUrlRecords(payload)) {
    const rawText = rawRecordText(record);
    const emails = workEmailsFromText(rawText, domain);
    if (emails.length === 0) {
      continue;
    }

    const url = stringRecordValue(record, "url");
    if (!url?.startsWith("http")) {
      continue;
    }

    for (const person of peopleHints) {
      if (person.email) {
        continue;
      }

      const email = emailForPersonFromRecord(person, emails, rawText, domain);
      if (!email) {
        continue;
      }

      const key = `${person.name.toLowerCase()}:${email}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      facts.push({
        path: personPath(person.role ?? null),
        value: [
          {
            name: person.name,
            role: person.role ?? null,
            sourceUrl: supportedUrl(person.sourceUrl) ? person.sourceUrl : null,
            email,
          },
        ],
        status: "verified",
        confidence: "medium",
        sourceType: sourceTypeForDirectUrl(url, domain),
        provider: "direct_exa",
        endpoint: request.name,
        citationUrl: url,
        citationTitle: stringRecordValue(record, "title") ?? "Direct Exa contact evidence",
        fetchedAt: new Date().toISOString(),
        rawText: rawText.slice(0, 500),
      });
    }
  }

  return facts;
}

function rawRecordText(record: Record<string, unknown>) {
  const parts = [
    stringRecordValue(record, "title"),
    stringRecordValue(record, "text"),
    stringRecordValue(record, "summary"),
    stringRecordValue(record, "url"),
    ...(Array.isArray(record.highlights) ? record.highlights.filter((part): part is string => typeof part === "string") : []),
  ];
  return parts.filter(Boolean).join("\n");
}

function workEmailsFromText(text: string, domain: string) {
  const normalizedDomain = normalizeDomain(domain);
  const emails = Array.from(text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi))
    .map((match) => match[0].toLowerCase())
    .filter((email) => normalizeDomain(email.split("@")[1] ?? "") === normalizedDomain)
    .filter((email) => {
      const local = email.split("@")[0];
      return typeof local === "string" && local.length > 0 && !genericLocalParts.has(local);
    });

  return Array.from(new Set(emails));
}

function emailForPersonFromRecord(
  person: NamedPeopleEmailHint,
  emails: string[],
  rawText: string,
  domain: string,
) {
  const expected = new Set(emailCandidatesForPerson(person.name, domain).map((email) => email.toLowerCase()));
  const patternMatch = emails.find((email) => expected.has(email));
  if (patternMatch) {
    return patternMatch;
  }

  const normalizedText = normalizePersonText(rawText);
  const normalizedName = normalizePersonText(person.name);
  const tokens = person.name.split(/\s+/).map((token) => normalizePersonText(token)).filter((token) => token.length > 1);
  const fullNameMentioned = normalizedName.length > 0 && normalizedText.includes(normalizedName);
  const enoughNameTokensMentioned = tokens.length >= 2 && tokens.every((token) => normalizedText.includes(token));
  if (!fullNameMentioned && !enoughNameTokensMentioned) {
    return null;
  }

  const first = cleanEmailPart(person.name.split(/\s+/)[0]);
  const last = cleanEmailPart(person.name.split(/\s+/).slice(1).join(""));
  return emails.find((email) => {
    const local = email.split("@")[0] ?? "";
    return Boolean((last && local.includes(last)) || (first && local === first));
  }) ?? null;
}

function emailCandidatesForPerson(name: string, domain: string) {
  const first = cleanEmailPart(name.split(/\s+/)[0]);
  const last = cleanEmailPart(name.split(/\s+/).slice(1).join(""));
  if (!first) {
    return [];
  }

  const firstInitial = first.charAt(0);
  return Array.from(new Set([
    `${first}@${domain}`,
    ...(last ? [
      `${first}.${last}@${domain}`,
      `${firstInitial}${last}@${domain}`,
      `${first}${last}@${domain}`,
      `${first}_${last}@${domain}`,
      `${firstInitial}.${last}@${domain}`,
    ] : []),
  ]));
}

const genericLocalParts = new Set([
  "info", "support", "hello", "contact", "sales", "press", "media", "team",
  "help", "admin", "noreply", "no-reply", "donotreply", "do-not-reply",
  "marketing", "legal", "privacy", "security", "abuse", "postmaster",
  "billing", "accounts", "careers", "jobs", "hr", "people", "ops",
  "founders", "investors", "ir", "feedback", "news",
]);

function normalizeDomain(value: string) {
  return value.toLowerCase().replace(/^www\./, "");
}

function normalizePersonText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function cleanEmailPart(value: string | undefined) {
  const cleaned = value?.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return cleaned && cleaned.length > 0 ? cleaned : null;
}

function personPath(role: string | null): ProviderFactCandidate["path"] {
  const normalized = role?.toLowerCase() ?? "";
  return normalized.includes("founder") || normalized.includes("co-founder") || normalized.includes("cofounder")
    ? "team.founders"
    : "team.keyExecs";
}

function supportedUrl(value: string | null | undefined): value is string {
  if (!value) {
    return false;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
