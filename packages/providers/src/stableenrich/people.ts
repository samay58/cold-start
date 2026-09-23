import { cleanEmailPart, domainFromUrl, emailValue, extractUrlRecords, integerValue, numberValue, objectRecord, stringRecordValue, stringValue, supportedUrl, workEmailValue } from "../stableenrich-utils";
import type { ProviderFactCandidate } from "../types";
import { type StableenrichProbeResult, fullName, providerFact, stableenrichCitationUrl } from "./core";

const EXA_EMAIL_GENERIC_LOCAL_PARTS = new Set([
  "info", "support", "hello", "contact", "sales", "press", "media", "team",
  "help", "admin", "noreply", "no-reply", "donotreply", "do-not-reply",
  "marketing", "legal", "privacy", "security", "abuse", "postmaster",
  "billing", "accounts", "careers", "jobs", "hr", "people", "ops",
  "founders", "investors", "ir", "feedback", "news",
  "jane", "john", "example", "test", "demo", "sample", "your-name", "yourname",
  "firstname", "first", "lastname", "last", "name", "user", "username",
]);

const PLACE_OR_BRAND_TOKENS = new Set([
  "united", "states", "america", "kingdom", "york", "francisco", "angeles", "london",
  "europe", "asia", "africa", "australia", "canada", "mexico", "germany", "france",
  "lodge", "ventures", "partners", "capital", "fund", "funds", "company", "park",
  "email", "format", "profile", "group", "holdings", "series", "round", "team",
  "investors", "venture", "valuation",
]);

export function isLikelyPersonName(name: string): boolean {
  if (/[\n\r\t]/.test(name)) return false;
  if (!/^[A-Z][a-z]/.test(name)) return false;
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 3) return false;
  for (const word of words) {
    if (!/^[A-Z][a-zA-Z'’]+$/.test(word)) return false;
    if (PLACE_OR_BRAND_TOKENS.has(word.toLowerCase())) return false;
  }
  if (/\b(Inc|LLC|Corp|Ltd)\b/.test(name)) return false;
  return true;
}

export function dedupeByName<T extends { name: string }>(entries: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const entry of entries) {
    const key = entry.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out;
}

export function extractPeopleFromExaEmailResults(payload: unknown, domain: string): PersonRecord[] {
  const records = extractUrlRecords(payload);
  const emailDomain = domain.replace(/^www\./i, "").toLowerCase();
  const emailRegex = new RegExp(`([A-Za-z0-9._+\\-]+)@${emailDomain.replace(/[.\\\\]/g, "\\$&")}`, "gi");
  const found = new Map<string, PersonRecord>();

  for (const record of records) {
    const url = stringRecordValue(record, "url") ?? "";
    const title = stringRecordValue(record, "title") ?? "";
    const text = stringRecordValue(record, "text") ?? stringRecordValue(record, "summary") ?? "";
    const highlights = Array.isArray(record.highlights) ? record.highlights.filter((h): h is string => typeof h === "string").join("\n") : "";
    const haystack = [title, text, highlights].join("\n");
    if (!haystack) continue;

    emailRegex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = emailRegex.exec(haystack)) !== null) {
      const local = (match[1] ?? "").toLowerCase();
      if (!local || EXA_EMAIL_GENERIC_LOCAL_PARTS.has(local)) continue;
      const email = `${local}@${emailDomain}`;
      if (found.has(email)) continue;

      const person = personFromEmailMention({
        local,
        email,
        snippet: haystack,
        title,
        sourceUrl: url,
      });
      if (person) {
        found.set(email, person);
      }
    }
  }

  return Array.from(found.values());
}

function personFromEmailMention(input: {
  local: string;
  email: string;
  snippet: string;
  title: string;
  sourceUrl: string;
}): PersonRecord | null {
  const fromLocal = nameGuessFromLocalPart(input.local);
  const fromSnippet = nameGuessFromSnippet(input.snippet, input.local) ?? nameGuessFromSnippet(input.title, input.local);
  const best = fromSnippet ?? fromLocal;
  if (!best) {
    return null;
  }
  const [firstName, ...rest] = best.split(/\s+/).filter(Boolean);
  if (!firstName) return null;
  const lastName = rest.join(" ").trim();
  return {
    name: best,
    firstName,
    ...(lastName ? { lastName } : {}),
    email: input.email,
    emailStatus: "verified",
    ...(input.sourceUrl && supportedUrl(input.sourceUrl) ? { sourceUrl: input.sourceUrl } : {}),
  };
}

function nameGuessFromLocalPart(local: string): string | null {
  if (local.includes(".")) {
    const parts = local.split(".").filter(Boolean);
    if (parts.length >= 2) {
      return parts.map(titleCase).join(" ");
    }
  }
  if (/^[a-z]+$/.test(local) && local.length >= 3) {
    return titleCase(local);
  }
  return null;
}

function nameGuessFromSnippet(text: string, local: string): string | null {
  const namePattern = /\b([A-Z][a-z'’]+(?:\s+[A-Z][a-z'’]+){1,2})\b/g;
  const candidates: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = namePattern.exec(text)) !== null) {
    const candidate = match[1]?.trim();
    if (!candidate) continue;
    if (!isLikelyPersonName(candidate)) continue;
    candidates.push(candidate);
  }
  if (candidates.length === 0) return null;

  const localFirst = local.split(".")[0]?.toLowerCase();
  const matched = candidates.find((candidate) => {
    const firstWord = candidate.split(/\s+/)[0]?.toLowerCase() ?? "";
    return localFirst && firstWord.startsWith(localFirst.slice(0, Math.min(localFirst.length, 4)));
  });
  return matched ?? null;
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

export type PersonRecord = {
  id?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  email?: string;
  emailStatus?: string;
  linkedinUrl?: string;
  sourceUrl?: string;
};

export function peopleFacts(result: StableenrichProbeResult): ProviderFactCandidate[] {
  if (result.name === "hunter_email_verifier") {
    return hunterEmailFact(result);
  }

  return extractPeopleRecords(result.result)
    .filter((person) => personMatchesProbeMetadata(person, result.metadata))
    .map((person) => withPersonMetadata(person, result.metadata))
    .filter((person) => isUsablePersonRecord(person))
    .flatMap((person) => personFactCandidates(person, result));
}

export function exaEmailFacts(result: StableenrichProbeResult): ProviderFactCandidate[] {
  const domain = result.metadata?.domain;
  if (!domain) return [];
  const people = extractPeopleFromExaEmailResults(result.result, domain);
  if (people.length === 0) return [];
  const fetchedAt = new Date().toISOString();
  return people.flatMap((person) => {
    const name = person.name ?? fullName(person.firstName, person.lastName);
    const email = person.email;
    if (!name || !email) return [];
    const role = person.role ?? null;
    const path = personPath(role);
    const sourceUrl = person.sourceUrl ?? result.endpointUrl;
    return [
      {
        path,
        value: [
          {
            name,
            role,
            sourceUrl: person.sourceUrl ?? null,
            email,
          },
        ],
        status: "verified" as const,
        confidence: "high" as const,
        sourceType: "news" as const,
        provider: "stableenrich" as const,
        endpoint: result.endpointUrl,
        citationUrl: sourceUrl,
        citationTitle: `Exa email discovery: ${email}`,
        fetchedAt,
        rawText: JSON.stringify({ person, source: result.endpointUrl }),
      } satisfies ProviderFactCandidate,
    ];
  });
}

function hunterEmailFact(result: StableenrichProbeResult): ProviderFactCandidate[] {
  const metadata = result.metadata;
  const email = workEmailValue(metadata?.email, metadata?.domain) ?? workEmailValue(stringRecordValue(objectRecord(result.result) ?? {}, "email"), metadata?.domain);
  if (!metadata?.personName || !email || !isUsablePersonName(metadata.personName) || !isPersonEmailCandidate(email, metadata.domain) || !hunterVerificationAccepted(result.result)) {
    return [];
  }

  const fetchedAt = new Date().toISOString();
  const role = metadata.role ?? null;
  return [
    providerFact(
      personPath(role),
      [
        {
          name: metadata.personName,
          role,
          sourceUrl: metadata.sourceUrl ?? null,
          email,
        },
      ],
      result,
      {
        citationUrl: stableenrichCitationUrl(result.endpointUrl, email),
        citationTitle: `Hunter email verification for ${email}`,
        fetchedAt,
        rawText: JSON.stringify(result.result),
        confidence: hunterVerificationConfidence(result.result),
      },
    ),
  ];
}

function personFactCandidates(person: PersonRecord, result: StableenrichProbeResult): ProviderFactCandidate[] {
  const name = person.name ?? fullName(person.firstName, person.lastName);
  if (!name) {
    return [];
  }

  const role = normalizedPersonRole(person.role);
  const email = workEmailValue(person.email, result.metadata?.domain);
  if (result.metadata?.personName && !email) {
    return [];
  }

  const fetchedAt = new Date().toISOString();
  const candidateSourceUrl = person.linkedinUrl ?? person.sourceUrl;
  const sourceUrl = candidateSourceUrl && supportedUrl(candidateSourceUrl) ? candidateSourceUrl : null;

  return [
    providerFact(
      personPath(role),
      [
        {
          name,
          role,
          sourceUrl,
          ...(email ? { email } : {}),
        },
      ],
      result,
      {
        citationUrl: peopleCitationUrl(result, person, email),
        citationTitle: `${result.name === "apollo_people_enrich" ? "Apollo people enrichment" : "Apollo people search"} for ${name}`,
        fetchedAt,
        rawText: JSON.stringify(result.result),
        confidence: email ? emailConfidence(person.emailStatus) : "medium",
      },
    ),
  ];
}

function withPersonMetadata(person: PersonRecord, metadata: StableenrichProbeResult["metadata"]): PersonRecord {
  return {
    ...person,
    ...(person.name || !metadata?.personName ? {} : { name: metadata.personName }),
    ...(person.role || !metadata?.role ? {} : { role: metadata.role }),
    ...(person.linkedinUrl || person.sourceUrl || !metadata?.sourceUrl ? {} : { sourceUrl: metadata.sourceUrl }),
  };
}

function personMatchesProbeMetadata(person: PersonRecord, metadata: StableenrichProbeResult["metadata"]) {
  if (metadata?.personName && !isUsablePersonName(metadata.personName)) {
    return false;
  }

  if (!metadata?.personName) {
    return true;
  }

  const name = person.name ?? fullName(person.firstName, person.lastName);
  if (!name) {
    return true;
  }
  if (!isUsablePersonName(name)) {
    return false;
  }

  return samePersonName(name, metadata.personName);
}

function samePersonName(left: string, right: string) {
  const leftNormalized = normalizePersonName(left);
  const rightNormalized = normalizePersonName(right);
  if (!leftNormalized || !rightNormalized) {
    return false;
  }
  if (leftNormalized === rightNormalized) {
    return true;
  }

  const leftTokens = new Set(leftNormalized.split(" ").filter((token) => token.length > 1));
  const rightTokens = rightNormalized.split(" ").filter((token) => token.length > 1);
  return rightTokens.length >= 2 && rightTokens.every((token) => leftTokens.has(token));
}

function normalizePersonName(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function extractPeopleRecords(payload: unknown): PersonRecord[] {
  const root = objectRecord(payload);
  if (!root) {
    return [];
  }

  if (Array.isArray(root.results)) {
    return root.results
      .map((item) => minervaPersonRecord(item))
      .filter((person): person is PersonRecord => person !== null);
  }

  if (Array.isArray(root.data)) {
    return root.data
      .map((item) => cladoPersonRecord(item))
      .filter((person): person is PersonRecord => person !== null);
  }

  const people = Array.isArray(root.people) ? root.people : Array.isArray(root.contacts) ? root.contacts : root.person ? [root.person] : [];
  return people
    .map((item): PersonRecord | null => {
      const record = objectRecord(item);
      if (!record) {
        return null;
      }

      const id = stringValue(record.id);
      const name = stringValue(record.name);
      const firstName = stringValue(record.first_name) ?? stringValue(record.firstName);
      const lastName = stringValue(record.last_name) ?? stringValue(record.lastName);
      const role = stringValue(record.title) ?? stringValue(record.role) ?? stringValue(record.headline);
      const email = stringValue(record.email);
      const emailStatus = stringValue(record.email_status) ?? stringValue(record.emailStatus);
      const linkedinUrl = stringValue(record.linkedin_url) ?? stringValue(record.linkedinUrl);

      return {
        ...(id ? { id } : {}),
        ...(name ? { name } : {}),
        ...(firstName ? { firstName } : {}),
        ...(lastName ? { lastName } : {}),
        ...(role ? { role } : {}),
        ...(email ? { email } : {}),
        ...(emailStatus ? { emailStatus } : {}),
        ...(linkedinUrl ? { linkedinUrl } : {}),
      };
    })
    .filter((person): person is PersonRecord => person !== null);
}

function minervaPersonRecord(value: unknown): PersonRecord | null {
  const record = objectRecord(value);
  if (!record) {
    return null;
  }
  if (record.is_match === false) {
    return null;
  }

  const professionalEmails = Array.isArray(record.professional_emails) ? record.professional_emails : [];
  const email = professionalEmails
    .flatMap((item) => {
      const emailRecord = objectRecord(item);
      return emailRecord ? [stringRecordValue(emailRecord, "email_address")] : [];
    })
    .find((candidate) => emailValue(candidate));
  const name = stringValue(record.full_name);
  const firstName = stringValue(record.first_name);
  const lastName = stringValue(record.last_name);
  const linkedinUrl = stringValue(record.linkedin_url);
  const role = stringValue(record.linkedin_title);
  if (!name && !firstName && !email) {
    return null;
  }

  return {
    ...(name ? { name } : {}),
    ...(firstName ? { firstName } : {}),
    ...(lastName ? { lastName } : {}),
    ...(role ? { role } : {}),
    ...(linkedinUrl ? { linkedinUrl } : {}),
    ...(email ? { email, emailStatus: "verified" } : {}),
  };
}

function cladoPersonRecord(value: unknown): PersonRecord | null {
  const record = objectRecord(value);
  if (!record) {
    return null;
  }
  const contacts = Array.isArray(record.contacts) ? record.contacts : [];
  const emailContact = contacts
    .map((item) => objectRecord(item))
    .filter((contact): contact is Record<string, unknown> => contact !== null)
    .find((contact) => contact.type === "email" && emailValue(contact.value) && numberValue(contact.rating) >= 70);
  const email = emailValue(emailContact?.value);
  if (!email) {
    return null;
  }

  return {
    email,
    emailStatus: numberValue(emailContact?.rating) >= 85 ? "verified" : "accept_all",
  };
}

export function normalizedPersonRole(role: string | undefined) {
  const trimmed = role?.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed.toLowerCase();
  const isCeo = normalized.includes("chief executive") || /\bceo\b/i.test(trimmed);
  if (normalized.includes("co-founder") || normalized.includes("cofounder")) {
    return isCeo ? "Co-Founder and CEO" : "Co-Founder";
  }
  if (normalized.includes("founder")) {
    return isCeo ? "Founder and CEO" : "Founder";
  }
  if (isCeo) {
    return "CEO";
  }
  return trimmed;
}

function roleScoreForPerson(role: string | undefined) {
  const normalized = role?.toLowerCase() ?? "";
  let score = 0;
  if (normalized.includes("founder") || normalized.includes("co-founder") || normalized.includes("cofounder")) {
    score += 8;
  }
  if (normalized.includes("chief") || normalized.includes("ceo")) {
    score += 6;
  }
  if (normalized.includes("president") || normalized.includes("owner") || normalized.includes("partner")) {
    score += 4;
  }
  if (normalized.includes("head") || normalized.includes("vp")) {
    score += 2;
  }
  return score;
}

export function rankPeople(people: PersonRecord[]) {
  const byKey = new Map<string, PersonRecord>();
  for (const person of people) {
    if (!isUsablePersonRecord(person)) {
      continue;
    }

    const name = person.name ?? fullName(person.firstName, person.lastName);
    if (!name) {
      continue;
    }
    const key = name.toLowerCase().trim();
    const current = byKey.get(key);
    const personScore = roleScoreForPerson(person.role);
    const currentScore = current ? roleScoreForPerson(current.role) : -1;
    if (!current || personScore > currentScore || (personScore === currentScore && !current.email && person.email)) {
      byKey.set(key, { ...person, name });
    }
  }

  return Array.from(byKey.values()).sort((left, right) => roleScoreForPerson(right.role) - roleScoreForPerson(left.role));
}

export function dedupePeopleInOrder(people: PersonRecord[]) {
  const seen = new Set<string>();
  const out: PersonRecord[] = [];
  for (const person of people) {
    if (!isUsablePersonRecord(person)) {
      continue;
    }
    const key = personNameKey(person);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(person);
  }
  return out;
}

export function apolloOrganizationIdForDomain(payload: unknown, domain: string) {
  const root = objectRecord(payload);
  if (!root) {
    return null;
  }
  const organizations = Array.isArray(root.organizations)
    ? root.organizations
    : Array.isArray(root.accounts)
      ? root.accounts
      : root.organization
        ? [root.organization]
        : [];
  const normalizedDomain = domain.toLowerCase().replace(/^www\./, "");
  for (const item of organizations) {
    const record = objectRecord(item);
    if (!record) {
      continue;
    }
    const candidateDomain =
      stringValue(record.primary_domain) ??
      stringValue(record.domain) ??
      domainFromUrl(stringValue(record.website_url));
    if (candidateDomain?.toLowerCase().replace(/^www\./, "") !== normalizedDomain) {
      continue;
    }

    const id = stringValue(record.id);
    if (id) {
      return id;
    }
  }

  return null;
}

export function peopleEnrichBody(person: PersonRecord, domain: string) {
  if (person.id) {
    return { id: person.id, domain, reveal_personal_emails: false };
  }

  if (person.linkedinUrl) {
    return { linkedin_url: person.linkedinUrl, domain, reveal_personal_emails: false };
  }

  if (person.firstName || person.lastName) {
    return {
      ...(person.firstName ? { first_name: person.firstName } : {}),
      ...(person.lastName ? { last_name: person.lastName } : {}),
      domain,
      reveal_personal_emails: false,
    };
  }

  return { name: person.name, domain, reveal_personal_emails: false };
}

export function minervaRecordForPerson(person: PersonRecord) {
  const [firstName, ...rest] = (person.name ?? "").split(/\s+/);
  return {
    record_id: personNameKey(person) ?? person.linkedinUrl ?? person.email ?? "person",
    ...(person.linkedinUrl ? { linkedin_url: person.linkedinUrl } : {}),
    ...(person.name ? { full_name: person.name } : {}),
    ...(person.firstName ?? firstName ? { first_name: person.firstName ?? firstName } : {}),
    ...(person.lastName ?? rest.join(" ") ? { last_name: person.lastName ?? rest.join(" ") } : {}),
  };
}

export function personMetadata(person: PersonRecord): NonNullable<StableenrichProbeResult["metadata"]> {
  const name = person.name ?? fullName(person.firstName, person.lastName);
  return {
    ...(name ? { personName: name } : {}),
    ...(person.role ? { role: person.role } : {}),
    ...(person.linkedinUrl || person.sourceUrl ? { sourceUrl: person.linkedinUrl ?? person.sourceUrl } : {}),
    ...(person.email ? { email: person.email } : {}),
  };
}

export function emailCandidatesForPerson(person: PersonRecord, domain: string) {
  if (!isUsablePersonRecord(person)) {
    return [];
  }

  const first = cleanEmailPart(person.firstName ?? person.name?.split(/\s+/)[0]);
  const last = cleanEmailPart(person.lastName ?? person.name?.split(/\s+/).slice(1).join(""));
  if (!first) {
    return [];
  }
  const firstInitial = first.charAt(0);
  const companyLocalPart = cleanEmailPart(domain.split(".")[0]);

  return Array.from(new Set([
    `${first}@${domain}`,
    ...(last ? [
      `${first}.${last}@${domain}`,
      `${firstInitial}${last}@${domain}`,
      `${first}${last}@${domain}`,
      `${first}_${last}@${domain}`,
      `${firstInitial}.${last}@${domain}`,
    ] : []),
  ]))
    .filter((email) => isPersonEmailCandidate(email, domain, companyLocalPart))
    .slice(0, 6);
}

const GENERIC_PERSON_NAME_TOKENS = new Set([
  "about",
  "admin",
  "career",
  "careers",
  "ceo",
  "cfo",
  "chief",
  "cmo",
  "company",
  "contact",
  "coo",
  "cofounder",
  "cpo",
  "cro",
  "cto",
  "current",
  "email",
  "employee",
  "employees",
  "executive",
  "expert",
  "format",
  "formats",
  "founder",
  "founders",
  "hr",
  "jobs",
  "just",
  "leadership",
  "linkedin",
  "management",
  "official",
  "officer",
  "people",
  "profile",
  "profiles",
  "subscribe",
  "support",
  "team",
  "test",
  "title",
  "today",
]);

function isUsablePersonRecord(person: PersonRecord) {
  const name = person.name ?? fullName(person.firstName, person.lastName);
  return !name || isUsablePersonName(name);
}

function isUsablePersonName(value: string) {
  const tokens = normalizePersonName(value).split(" ").filter(Boolean);
  if (tokens.length < 2 || tokens.length > 4) {
    return false;
  }

  return tokens.every((token) => token.length > 1 && !GENERIC_PERSON_NAME_TOKENS.has(token));
}

function isPersonEmailCandidate(email: string, domain: string | undefined, companyLocalPart = cleanEmailPart(domain?.split(".")[0])) {
  const local = cleanEmailPart(email.split("@")[0]);
  return Boolean(local && !EXA_EMAIL_GENERIC_LOCAL_PARTS.has(local) && (!companyLocalPart || local !== companyLocalPart));
}

export function personPath(role: string | null): ProviderFactCandidate["path"] {
  const normalized = role?.toLowerCase() ?? "";
  return normalized.includes("founder") || normalized.includes("co-founder") || normalized.includes("cofounder")
    ? "team.founders"
    : "team.keyExecs";
}

function peopleCitationUrl(result: StableenrichProbeResult, person: PersonRecord, email: string | null) {
  const sourceUrl = person.linkedinUrl ?? person.sourceUrl;
  if (sourceUrl && supportedUrl(sourceUrl)) {
    return sourceUrl;
  }

  const key = email ?? person.id ?? person.name ?? "person";
  return stableenrichCitationUrl(result.endpointUrl, key);
}

function hunterMinScore() {
  const configured = Number.parseInt(process.env.HUNTER_MIN_SCORE ?? "", 10);
  return Number.isFinite(configured) && configured > 0 ? configured : 70;
}

export function hunterVerificationAccepted(payload: unknown) {
  const record = objectRecord(payload);
  const status = stringValue(record?.status)?.toLowerCase();
  const score = integerValue(record?.score);
  return status === "valid" || (status === "accept_all" && score !== null && score >= hunterMinScore());
}

function hunterVerificationConfidence(payload: unknown): ProviderFactCandidate["confidence"] {
  const record = objectRecord(payload);
  const status = stringValue(record?.status)?.toLowerCase();
  const score = integerValue(record?.score);
  if (status === "valid" && score !== null && score >= 90) {
    return "high";
  }

  return "medium";
}

function emailConfidence(status: string | undefined): ProviderFactCandidate["confidence"] {
  const normalized = status?.toLowerCase() ?? "";
  if (normalized === "verified" || normalized === "valid") {
    return "high";
  }
  if (normalized === "guessed" || normalized === "unknown") {
    return "low";
  }
  return "medium";
}

export function personNameKey(person: PersonRecord) {
  const name = person.name ?? fullName(person.firstName, person.lastName);
  return name ? name.toLowerCase().replace(/\s+/g, " ").trim() : null;
}
