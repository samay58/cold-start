// Cheap leader hints read from search results the pipeline already paid for: a person's name,
// role, and LinkedIn or source URL, from Exa search records, provider sources, and email hints.
import { emailValue, escapeRegExp, extractUrlRecords, objectRecord, parseJsonOrNull, stringRecordValue, stringValue, supportedUrl } from "../stableenrich-utils";
import type { PeopleEmailHint, ProviderSource } from "../types";
import { type StableenrichProbeResult, isExaSearchProbe } from "./core";
import { type PersonRecord, normalizedPersonRole } from "./people";

export function peopleHintsFromSearchResults(
  results: PromiseSettledResult<StableenrichProbeResult>[],
  domain: string,
): PersonRecord[] {
  return results.flatMap((result) => {
    if (result.status !== "fulfilled" || !isExaSearchProbe(result.value.name)) {
      return [];
    }

    return extractUrlRecords(result.value.result).flatMap((record) => {
      const person = personHintFromSearchRecord(record, domain);
      return person ? [person] : [];
    });
  });
}

export function peopleHintsFromProviderSources(sources: ProviderSource[], domain: string): PersonRecord[] {
  return sources.flatMap((source) => {
    const parsed = objectRecord(parseJsonOrNull(source.rawText));
    const record = {
      ...(parsed ?? {}),
      title: stringValue(parsed?.title) ?? source.title,
      url: stringValue(parsed?.url) ?? source.url,
      text: stringValue(parsed?.text) ?? stringValue(parsed?.summary) ?? source.rawText,
    };
    const person = personHintFromSearchRecord(record, domain);
    return person ? [person] : [];
  });
}

function personHintFromSearchRecord(record: Record<string, unknown>, domain: string): PersonRecord | null {
  const title = stringRecordValue(record, "title") ?? stringRecordValue(record, "name");
  if (!title) {
    return null;
  }

  const url = stringRecordValue(record, "url");
  const text = stringRecordValue(record, "text") ?? stringRecordValue(record, "summary") ?? "";
  const lowerTitle = title.toLowerCase();
  if (lowerTitle.includes("email format")) {
    return null;
  }

  const roleishTitle = /\b(co-?founder|founder|ceo|chief executive|leadership|management)\b/i.test(title);
  const looksCompanyRelevant =
    recordMentionsTargetCompany(`${title}\n${text}`, domain) &&
    (isLinkedInPersonUrl(url) || roleishTitle || /current|present|co-?founder|president|ceo/i.test(text));
  if (!looksCompanyRelevant) {
    return null;
  }

  const name = personNameFromSearchRecord(title, text);
  if (!name) {
    return null;
  }

  const [firstName, ...rest] = name.split(/\s+/);
  if (!firstName) {
    return null;
  }
  const lastName = rest.join(" ");
  const role = roleHintFromText(text, domain) ?? roleHintFromTitle(title);
  const sourceUrl = url && supportedUrl(url) ? url : undefined;
  return {
    name,
    firstName,
    ...(lastName ? { lastName } : {}),
    ...(role ? { role } : {}),
    ...(sourceUrl && isLinkedInPersonUrl(sourceUrl) ? { linkedinUrl: sourceUrl } : {}),
    ...(sourceUrl && !isLinkedInPersonUrl(sourceUrl) ? { sourceUrl } : {}),
  };
}

export function peopleRecordsFromEmailHints(hints: PeopleEmailHint[]): PersonRecord[] {
  return hints.flatMap((hint) => {
    const id = stringValue(hint.id);
    const name = stringValue(hint.name);
    const firstName = stringValue(hint.firstName) ?? name?.split(/\s+/)[0];
    const lastName = stringValue(hint.lastName) ?? name?.split(/\s+/).slice(1).join(" ");
    const role = stringValue(hint.role);
    const email = emailValue(hint.email);
    const sourceUrl = stringValue(hint.linkedinUrl) ?? stringValue(hint.sourceUrl);
    const supportedSourceUrl = sourceUrl && supportedUrl(sourceUrl) ? sourceUrl : null;

    if (!name && !firstName) {
      return [];
    }

    return [
      {
        ...(id ? { id } : {}),
        ...(name ? { name } : {}),
        ...(firstName ? { firstName } : {}),
        ...(lastName ? { lastName } : {}),
        ...(role ? { role } : {}),
        ...(email ? { email } : {}),
        ...(supportedSourceUrl && isLinkedInPersonUrl(supportedSourceUrl) ? { linkedinUrl: supportedSourceUrl } : {}),
        ...(supportedSourceUrl && !isLinkedInPersonUrl(supportedSourceUrl) ? { sourceUrl: supportedSourceUrl } : {}),
      },
    ];
  });
}

function personNameFromSearchRecord(title: string, text: string) {
  const titleName = title.split(/\s[-|]\s/)[0]?.trim();
  if (titleName && looksLikePersonName(titleName)) {
    return titleName;
  }

  const headingName = text.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return headingName && looksLikePersonName(headingName) ? headingName : null;
}

function recordMentionsTargetCompany(value: string, domain: string) {
  const normalized = value.toLowerCase();
  return targetCompanyTerms(domain).some((term) => normalized.includes(term));
}

function targetCompanyTerms(domain: string) {
  const normalized = domain.toLowerCase();
  const bare = normalized.replace(/^www\./, "");
  const firstLabel = bare.split(".")[0] ?? bare;
  return Array.from(new Set([
    bare,
    bare.replace(/\./g, " "),
    ...(firstLabel.length >= 4 ? [firstLabel] : []),
  ].filter((term) => term.length >= 3)));
}

function looksLikePersonName(value: string) {
  const blocked = new Set([
    "about",
    "company",
    "technical",
    "founder",
    "co-founder",
    "ceo",
    "leadership",
    "team",
    "email",
    "format",
    "formats",
  ]);
  const parts = value.split(/\s+/).filter(Boolean);
  return (
    parts.length >= 2 &&
    parts.length <= 4 &&
    parts.every((part) => /^[A-Z][A-Za-z.'-]{1,}$/.test(part) && !blocked.has(part.toLowerCase()))
  );
}

function isLinkedInPersonUrl(value: string | undefined) {
  if (!value) {
    return false;
  }

  try {
    const parsed = new URL(value);
    return parsed.hostname.replace(/^www\./i, "").toLowerCase() === "linkedin.com" && parsed.pathname.startsWith("/in/");
  } catch {
    return false;
  }
}

function roleHintFromTitle(title: string) {
  const normalized = title.toLowerCase();
  if (normalized.includes("co-founder") || normalized.includes("cofounder")) {
    return "Co-Founder";
  }
  if (normalized.includes("founder")) {
    return "Founder";
  }
  if (normalized.includes("chief executive") || /\bceo\b/i.test(title)) {
    return "CEO";
  }
  return undefined;
}

function roleHintFromText(text: string, domain: string) {
  const companyTerms = targetCompanyTerms(domain)
    .map((term) => escapeRegExp(term).replace(/\s+/g, "[\\s-]+"))
    .join("|");
  if (!companyTerms) {
    return undefined;
  }

  const match = text.match(new RegExp(`(?:^|\\n)(?:#{1,4}\\s*)?(.{2,90}?)\\s+at\\s+\\[?(?:${companyTerms})\\]?`, "i"));
  const role = match?.[1]?.trim();
  return role && !looksLikePersonName(role) ? normalizedPersonRole(role) ?? role : undefined;
}

