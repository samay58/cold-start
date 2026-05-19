const SEC_SEARCH_URL = "https://efts.sec.gov/LATEST/search-index";
const DEFAULT_USER_AGENT = "Cold Start research@semitechie.vc";

export type SecFormDOfficer = {
  firstName: string;
  lastName: string;
  fullName: string;
  relationships: string[];
  titleHint: string | null;
};

export type SecFormDResult = {
  cik: string;
  accessionNumber: string;
  filedAt: string | null;
  officers: SecFormDOfficer[];
  formUrl: string;
};

export type SecFormDFailure = {
  stage: "search" | "form_xml" | "parse";
  reason: string;
};

type FetchLike = (input: string, init?: { headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

export async function fetchSecFormD(input: {
  domain: string;
  companyName?: string;
  fetcher?: FetchLike;
  userAgent?: string;
}): Promise<SecFormDResult | SecFormDFailure> {
  const fetcher: FetchLike = (input.fetcher ?? (fetch as unknown as FetchLike));
  const userAgent = input.userAgent ?? process.env.SEC_USER_AGENT ?? DEFAULT_USER_AGENT;
  const headers = { "User-Agent": userAgent, Accept: "application/json" };

  const query = secSearchQuery(input.domain, input.companyName);
  const searchUrl = `${SEC_SEARCH_URL}?q=${encodeURIComponent(query)}&forms=D`;

  let searchJson: unknown;
  try {
    const response = await fetcher(searchUrl, { headers });
    if (!response.ok) {
      return { stage: "search", reason: `HTTP ${response.status}` };
    }
    searchJson = await response.json();
  } catch (error) {
    return { stage: "search", reason: error instanceof Error ? error.message : String(error) };
  }

  const hit = pickBestHit(searchJson, input.domain, input.companyName);
  if (!hit) {
    return { stage: "search", reason: "no_form_d_match" };
  }

  const formUrl = formPrimaryDocUrl(hit.cik, hit.accessionNumber);
  let xml: string;
  try {
    const response = await fetcher(formUrl, { headers: { "User-Agent": userAgent, Accept: "application/xml" } });
    if (!response.ok) {
      return { stage: "form_xml", reason: `HTTP ${response.status}` };
    }
    xml = await response.text();
  } catch (error) {
    return { stage: "form_xml", reason: error instanceof Error ? error.message : String(error) };
  }

  const officers = parseRelatedPersons(xml);
  if (officers.length === 0) {
    return { stage: "parse", reason: "no_related_persons" };
  }

  return {
    cik: hit.cik,
    accessionNumber: hit.accessionNumber,
    filedAt: hit.filedAt,
    officers,
    formUrl,
  };
}

export function isSecFormDResult(value: SecFormDResult | SecFormDFailure): value is SecFormDResult {
  return "officers" in value;
}

function secSearchQuery(domain: string, companyName?: string) {
  const cleanDomain = domain.replace(/^www\./i, "").toLowerCase();
  return companyName ? `"${companyName}" "${cleanDomain}"` : `"${cleanDomain}"`;
}

type SearchHit = { cik: string; accessionNumber: string; filedAt: string | null; entityName: string | null };

function pickBestHit(payload: unknown, domain: string, companyName?: string): SearchHit | null {
  const root = isRecord(payload) ? payload : null;
  const hitsParent = root && isRecord(root.hits) ? root.hits : null;
  const hitsRaw = hitsParent && Array.isArray(hitsParent.hits) ? hitsParent.hits : [];
  const hits = hitsRaw
    .map((entry): SearchHit | null => {
      if (!isRecord(entry)) return null;
      const source = isRecord(entry._source) ? entry._source : entry;
      const ciks = isArrayOfStrings(source.ciks) ? source.ciks : isArrayOfStrings((source as Record<string, unknown>).cik) ? (source as Record<string, unknown>).cik as string[] : [];
      const adsh = stringValue(source.adsh ?? source.accessionNumber);
      const filedAt = stringValue(source.file_date ?? source.filed ?? source.fileDate);
      const entityName = stringValue((isArrayOfStrings(source.display_names) ? source.display_names[0] : undefined) ?? source.entity_name ?? source.entityName);
      const cik = ciks[0] ?? null;
      if (!cik || !adsh) return null;
      return { cik, accessionNumber: adsh, filedAt, entityName };
    })
    .filter((hit): hit is SearchHit => hit !== null);

  if (hits.length === 0) return null;

  const target = (companyName ?? domain.split(".")[0] ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const scored = hits.map((hit) => {
    const entity = hit.entityName?.toLowerCase().replace(/[^a-z0-9]+/g, "") ?? "";
    let score = 0;
    if (target && entity && entity.includes(target)) score += 5;
    if (target && entity && entity.startsWith(target)) score += 3;
    if (hit.filedAt) score += 1;
    return { hit, score };
  });
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aDate = a.hit.filedAt ?? "";
    const bDate = b.hit.filedAt ?? "";
    return bDate.localeCompare(aDate);
  });
  return scored[0]?.hit ?? null;
}

function formPrimaryDocUrl(cik: string, accession: string) {
  const accessionNoDash = accession.replace(/-/g, "");
  const cikInt = Number.parseInt(cik, 10);
  return `https://www.sec.gov/Archives/edgar/data/${cikInt}/${accessionNoDash}/primary_doc.xml`;
}

function parseRelatedPersons(xml: string): SecFormDOfficer[] {
  const officers: SecFormDOfficer[] = [];
  const personRegex = /<relatedPersonInfo>([\s\S]*?)<\/relatedPersonInfo>/g;
  let block: RegExpExecArray | null;
  while ((block = personRegex.exec(xml)) !== null) {
    const body = block[1] ?? "";
    const firstName = tagValue(body, "firstName");
    const lastName = tagValue(body, "lastName");
    if (!firstName || !lastName) continue;
    const relationships: string[] = [];
    const relRegex = /<relationship>([^<]+)<\/relationship>/g;
    let rel: RegExpExecArray | null;
    while ((rel = relRegex.exec(body)) !== null) {
      const value = rel[1]?.trim();
      if (value) relationships.push(value);
    }
    const titleHint = tagValue(body, "relationshipClarification");
    officers.push({
      firstName,
      lastName,
      fullName: `${firstName} ${lastName}`.replace(/\s+/g, " ").trim(),
      relationships,
      titleHint,
    });
  }
  return officers;
}

function tagValue(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  if (!match) return null;
  const value = match[1]?.trim();
  return value && value.length > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isArrayOfStrings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function stringValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
