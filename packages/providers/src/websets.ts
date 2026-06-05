import { normalizeNamedPeopleEmailHints, type NamedPeopleEmailHint } from "./people-hints";
import type { PeopleEmailHint, ProviderFactCandidate, ProviderSource, WebsetsEnv } from "./types";

const defaultWebsetsBaseUrl = "https://api.exa.ai";
const MAX_WEBSETS_PEOPLE = 3;

export type WebsetsRequest = {
  method: "GET" | "POST";
  url: string;
  headers: Record<string, string>;
  body?: Record<string, unknown>;
};

export type WebsetsFailure = {
  name: "exa_websets_people_email";
  endpointUrl: string;
  error: string;
};

export type WebsetsPeopleEmailResult = {
  sources: ProviderSource[];
  facts: ProviderFactCandidate[];
  failures: WebsetsFailure[];
  skipped: boolean;
  emailDiscovery: Array<{
    name: string;
    role: string | null;
    discoverySource: "people_hint";
    emailFound: string | null;
    emailSource: "websets" | null;
  }>;
  trace: {
    skipped: boolean;
    sourceCount: number;
    factCount: number;
    failureCount: number;
    itemCount?: number;
    acceptedEmailCount?: number;
    rejectedEmailCount?: number;
    websetId?: string;
    dashboardUrl?: string;
  };
};

type FetchJson = (request: WebsetsRequest) => Promise<unknown>;

type WebsetsItem = {
  id?: string;
  properties?: {
    type?: string;
    url?: string;
    description?: string;
    person?: {
      name?: string;
      position?: string;
      company?: {
        name?: string;
      };
    };
  };
  enrichments?: Array<{
    status?: string;
    format?: string;
    result?: unknown;
    references?: Array<{
      title?: string;
      snippet?: string;
      url?: string;
    }>;
  }> | null;
};

export function missingWebsetsConfig(env: WebsetsEnv): string[] {
  return env.EXA_WEBSETS_API_KEY?.trim() ? [] : ["EXA_WEBSETS_API_KEY"];
}

function websetsBaseUrl(env: WebsetsEnv) {
  return (env.EXA_WEBSETS_BASE_URL?.trim() || defaultWebsetsBaseUrl).replace(/\/+$/, "");
}

function websetsHeaders(env: WebsetsEnv) {
  const apiKey = env.EXA_WEBSETS_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Missing Exa Websets config: EXA_WEBSETS_API_KEY");
  }

  return {
    "Content-Type": "application/json",
    "x-api-key": apiKey
  };
}

function displayCompanyName(domain: string) {
  const root = domain.replace(/^www\./i, "").split(".")[0] ?? domain;
  return root ? root.charAt(0).toUpperCase() + root.slice(1) : domain;
}

function formatPeopleList(people: NamedPeopleEmailHint[]) {
  const names = people.map((person) => person.name);
  if (names.length <= 2) {
    return names.join(" or ");
  }
  return `${names.slice(0, -1).join(", ")}, or ${names[names.length - 1]}`;
}

export function buildWebsetsPeopleContactRequest(input: {
  env: WebsetsEnv;
  domain: string;
  peopleHints: PeopleEmailHint[];
  externalId: string;
}): WebsetsRequest {
  const people = normalizeNamedPeopleEmailHints(input.peopleHints).slice(0, MAX_WEBSETS_PEOPLE);
  if (people.length === 0) {
    throw new Error("Cannot create a Websets people contact request without named people");
  }

  const names = formatPeopleList(people);
  const companyName = displayCompanyName(input.domain);

  return {
    method: "POST",
    url: `${websetsBaseUrl(input.env)}/websets/v0/websets`,
    headers: websetsHeaders(input.env),
    body: {
      title: `Cold Start contacts: ${input.domain}`,
      externalId: input.externalId,
      search: {
        query: `Find ${names} at ${input.domain} and return only their current professional profile.`,
        count: people.length,
        entity: { type: "person" },
        criteria: [
          { description: `Person is one of ${names}.` },
          { description: `Person is currently affiliated with ${input.domain} or ${companyName}.` }
        ]
      },
      enrichments: [
        {
          description: `Current professional email for this person at ${input.domain}. Return the best current email even when it is personal or on another domain. Return null only when the email clearly belongs to a previous employer, school, investor, or unrelated company.`,
          format: "email",
          metadata: {
            domain: input.domain,
            purpose: "cold-start-contact-email"
          }
        }
      ],
      metadata: {
        domain: input.domain,
        provider: "cold-start"
      }
    }
  };
}

export async function fetchWebsetsPeopleEmailSources(input: {
  env: WebsetsEnv;
  domain: string;
  peopleHints: PeopleEmailHint[];
  externalId?: string;
  fetchJson?: FetchJson;
  pollAttempts?: number;
  pollIntervalMs?: number;
}): Promise<WebsetsPeopleEmailResult> {
  const people = normalizeNamedPeopleEmailHints(input.peopleHints).slice(0, MAX_WEBSETS_PEOPLE);
  const discovery: WebsetsPeopleEmailResult["emailDiscovery"] = people.map((person) => ({
    name: person.name,
    role: person.role ?? null,
    discoverySource: "people_hint" as const,
    emailFound: null,
    emailSource: null
  }));

  if (missingWebsetsConfig(input.env).length > 0 || people.length === 0) {
    return emptyResult({ skipped: true, emailDiscovery: discovery });
  }

  const fetchJson = input.fetchJson ?? websetsJson;
  const externalId = input.externalId ?? `cold-start-contact-${input.domain.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase()}-${Date.now().toString(36)}`;
  const createRequest = buildWebsetsPeopleContactRequest({
    env: input.env,
    domain: input.domain,
    peopleHints: people,
    externalId
  });

  try {
    const created = objectRecord(await fetchJson(createRequest));
    const websetId = stringValue(created?.id) ?? externalId;
    const dashboardUrl = stringValue(created?.dashboardUrl);
    const pollAttempts = Math.max(1, Math.min(5, input.pollAttempts ?? 3));
    const pollIntervalMs = Math.max(0, Math.min(10_000, input.pollIntervalMs ?? 1_500));
    let items: WebsetsItem[] = [];
    let parsed = parseWebsetsItems({
      domain: input.domain,
      people,
      items,
      dashboardUrl: dashboardUrl ?? createRequest.url,
      fetchedAt: new Date().toISOString()
    });

    for (let attempt = 0; attempt < pollAttempts; attempt += 1) {
      const listRequest: WebsetsRequest = {
        method: "GET",
        url: `${websetsBaseUrl(input.env)}/websets/v0/websets/${encodeURIComponent(websetId)}/items?limit=10`,
        headers: websetsHeaders(input.env)
      };
      const listed = objectRecord(await fetchJson(listRequest));
      items = Array.isArray(listed?.data) ? listed.data.flatMap((item) => {
        const record = objectRecord(item);
        return record ? [record as WebsetsItem] : [];
      }) : [];
      parsed = parseWebsetsItems({
        domain: input.domain,
        people,
        items,
        dashboardUrl: dashboardUrl ?? createRequest.url,
        fetchedAt: new Date().toISOString()
      });

      if (parsed.accepted.length > 0 || parsed.observedEmailCount > 0 || attempt === pollAttempts - 1) {
        break;
      }
      if (pollIntervalMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      }
    }

    for (const entry of discovery) {
      const found = parsed.accepted.find((candidate) => namesMatch(candidate.name, entry.name));
      if (found) {
        entry.emailFound = found.email;
        entry.emailSource = "websets";
      }
    }

    const facts = factCandidatesFromAccepted(input.domain, parsed.accepted, dashboardUrl ?? createRequest.url);
    return {
      sources: parsed.sources,
      facts,
      failures: [],
      skipped: false,
      emailDiscovery: discovery,
      trace: {
        skipped: false,
        sourceCount: parsed.sources.length,
        factCount: facts.length,
        failureCount: 0,
        itemCount: items.length,
        acceptedEmailCount: parsed.accepted.length,
        rejectedEmailCount: parsed.rejectedEmailCount,
        websetId,
        ...(dashboardUrl ? { dashboardUrl } : {})
      }
    };
  } catch (error) {
    return {
      sources: [],
      facts: [],
      failures: [
        {
          name: "exa_websets_people_email",
          endpointUrl: createRequest.url,
          error: error instanceof Error ? error.message : String(error)
        }
      ],
      skipped: false,
      emailDiscovery: discovery,
      trace: {
        skipped: false,
        sourceCount: 0,
        factCount: 0,
        failureCount: 1
      }
    };
  }
}

function emptyResult(input: {
  skipped: boolean;
  emailDiscovery: WebsetsPeopleEmailResult["emailDiscovery"];
}): WebsetsPeopleEmailResult {
  return {
    sources: [],
    facts: [],
    failures: [],
    skipped: input.skipped,
    emailDiscovery: input.emailDiscovery,
    trace: {
      skipped: input.skipped,
      sourceCount: 0,
      factCount: 0,
      failureCount: 0,
      itemCount: 0,
      acceptedEmailCount: 0,
      rejectedEmailCount: 0
    }
  };
}

function parseWebsetsItems(input: {
  domain: string;
  people: NamedPeopleEmailHint[];
  items: WebsetsItem[];
  dashboardUrl: string;
  fetchedAt: string;
}) {
  const accepted: Array<{ name: string; role: string | null; email: string; sourceUrl: string; rawText: string }> = [];
  const sources: ProviderSource[] = [];
  let rejectedEmailCount = 0;
  let observedEmailCount = 0;

  for (const item of input.items) {
    const person = item.properties?.person;
    const name = stringValue(person?.name);
    const hint = name ? input.people.find((candidate) => namesMatch(candidate.name, name)) : undefined;
    if (!name || !hint) {
      continue;
    }

    const sourceUrl = supportedUrl(item.properties?.url) ? item.properties?.url as string : input.dashboardUrl;
    const emails = emailsFromEnrichments(item.enrichments);
    observedEmailCount += emails.length;
    const targetEmail = emails.find((candidate) => emailDomainMatches(candidate, input.domain));
    const currentCompanyMatch = itemMatchesTargetCompany(item, input.domain);
    if (!currentCompanyMatch && !targetEmail) {
      rejectedEmailCount += emails.length;
      continue;
    }

    const email = targetEmail ?? emails[0];
    rejectedEmailCount += email ? emails.length - 1 : emails.length;
    if (!email) {
      continue;
    }

    const role = hint.role ?? stringValue(person?.position);
    const rawText = [
      `${name}${role ? `, ${role}` : ""}`,
      person?.company?.name ? `Company: ${person.company.name}` : null,
      `Email: ${email}`
    ].filter(Boolean).join("\n");
    accepted.push({ name, role: role ?? null, email, sourceUrl, rawText });
    sources.push({
      url: sourceUrl,
      title: `Exa Websets email: ${name}`,
      sourceType: "enrichment",
      fetchedAt: input.fetchedAt,
      rawText,
      intent: "email_verification"
    });
  }

  return { accepted, sources, rejectedEmailCount, observedEmailCount };
}

function factCandidatesFromAccepted(
  domain: string,
  accepted: Array<{ name: string; role: string | null; email: string; sourceUrl: string; rawText: string }>,
  dashboardUrl: string
): ProviderFactCandidate[] {
  const byPath = new Map<ProviderFactCandidate["path"], Array<{ name: string; role: string | null; email: string; sourceUrl: string }>>();
  for (const person of accepted) {
    const path = personPath(person.role);
    const current = byPath.get(path) ?? [];
    current.push({
      name: person.name,
      role: person.role,
      email: person.email,
      sourceUrl: person.sourceUrl
    });
    byPath.set(path, current);
  }

  return Array.from(byPath.entries()).map(([path, people]) => ({
    path,
    value: people,
    status: "verified",
    confidence: "high",
    sourceType: "enrichment",
    provider: "websets",
    endpoint: "exa_websets_people_email",
    citationUrl: people[0]?.sourceUrl ?? dashboardUrl,
    citationTitle: `Exa Websets email enrichment for ${domain}`,
    fetchedAt: new Date().toISOString(),
    rawText: people.map((person) => `${person.name}: ${person.email}`).join("\n")
  }));
}

async function websetsJson(request: WebsetsRequest): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      ...(request.body ? { body: JSON.stringify(request.body) } : {}),
      signal: controller.signal
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) as unknown : {};
    if (!response.ok) {
      throw new Error(`Exa Websets request failed (${response.status}): ${text.slice(0, 500)}`);
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function emailsFromEnrichments(enrichments: WebsetsItem["enrichments"]) {
  const emails = new Set<string>();
  for (const enrichment of enrichments ?? []) {
    if (enrichment.status && enrichment.status !== "completed") {
      continue;
    }
    if (enrichment.format && enrichment.format !== "email") {
      continue;
    }
    for (const value of flattenValues(enrichment.result)) {
      const email = emailValue(value);
      if (email) {
        emails.add(email);
      }
    }
  }
  return Array.from(emails);
}

function flattenValues(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value.flatMap(flattenValues);
  }
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(flattenValues);
  }
  return [value];
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function emailValue(value: unknown) {
  const candidate = stringValue(value);
  if (!candidate || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(candidate)) {
    return null;
  }
  return candidate.toLowerCase();
}

function normalizeDomain(value: string) {
  return value.toLowerCase().replace(/^www\./, "");
}

function companyTermsFromDomain(domain: string) {
  const normalizedDomain = normalizeDomain(domain);
  const root = normalizedDomain.split(".")[0] ?? normalizedDomain;
  return Array.from(new Set([normalizedDomain, root].filter((term) => term.length >= 2)));
}

function emailDomainMatches(email: string, domain: string) {
  return normalizeDomain(email.split("@")[1] ?? "") === normalizeDomain(domain);
}

function normalizeCompanyText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9.]+/g, " ").trim();
}

function itemMatchesTargetCompany(item: WebsetsItem, domain: string) {
  const haystack = normalizeCompanyText([
    item.properties?.person?.company?.name,
    item.properties?.person?.position,
    item.properties?.description
  ].filter(Boolean).join(" "));
  const terms = companyTermsFromDomain(domain);
  return terms.some((term) => haystack.includes(normalizeCompanyText(term)));
}

function normalizePersonName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function namesMatch(left: string, right: string) {
  return normalizePersonName(left) === normalizePersonName(right);
}

function supportedUrl(value: string | null | undefined): value is string {
  if (!value) {
    return false;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function personPath(role: string | null): ProviderFactCandidate["path"] {
  const normalized = role?.toLowerCase() ?? "";
  return normalized.includes("founder") || normalized.includes("co-founder") || normalized.includes("cofounder")
    ? "team.founders"
    : "team.keyExecs";
}
