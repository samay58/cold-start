import {
  isTrustedSourceGateHost,
  normalizeAuthorityHost,
  sourceTargetAliasesForDomain,
  sourceTargetContextTermsForDomain,
  type GenerationSourceRejection,
  type GenerationSourceRejectionReason,
  type GenerationSourceTrace
} from "@cold-start/core";
import type { ProviderSource } from "@cold-start/providers";

export type SourceGateResult = {
  accepted: ProviderSource[];
  rejected: Array<{
    source: ProviderSource;
    reason: GenerationSourceRejectionReason;
  }>;
};

export function filterSourcesForDomain(input: {
  domain: string;
  companyName?: string | null;
  sources: ProviderSource[];
}): SourceGateResult {
  const accepted: ProviderSource[] = [];
  const rejected: SourceGateResult["rejected"] = [];
  const targetDomain = normalizeAuthorityHost(input.domain);
  const targetRoot = compactRootLabel(targetDomain);
  const targetAliases = sourceTargetAliasesForDomain(targetDomain, input.companyName);
  const targetContextTerms = sourceTargetContextTermsForDomain(targetDomain);

  for (const source of input.sources) {
    const reason = sourceRejectionReason(source, { targetDomain, targetRoot, targetAliases, targetContextTerms });
    if (reason) {
      rejected.push({ source, reason });
    } else {
      accepted.push(source);
    }
  }

  return { accepted, rejected };
}

export function sourceGateTrace(result: SourceGateResult) {
  return {
    acceptedCount: result.accepted.length,
    rejectedCount: result.rejected.length,
    acceptedSamples: result.accepted.slice(0, 8).map(sourceTrace),
    rejectedSamples: result.rejected.slice(0, 12).map(({ source, reason }) => ({
      ...sourceTrace(source),
      reason
    } satisfies GenerationSourceRejection))
  };
}

function sourceRejectionReason(
  source: ProviderSource,
  target: { targetDomain: string; targetRoot: string; targetAliases: string[]; targetContextTerms: string[] }
): GenerationSourceRejectionReason | null {
  const parsed = parseSourceUrl(source.url);

  if (!parsed) {
    return source.sourceType === "enrichment" ? null : "unsupported_protocol";
  }

  const hostMatchesTarget = parsed.host === target.targetDomain || parsed.host.endsWith(`.${target.targetDomain}`);
  if (source.sourceType === "company_site" && !hostMatchesTarget) {
    return "company_site_domain_mismatch";
  }

  if (!hostMatchesTarget && looksLikeWrongSameNameDomain(parsed.root, target.targetRoot, parsed.host)) {
    return "ambiguous_same_name_domain";
  }

  // Comparables are competitor pages by definition; they won't mention the target.
  // Let them through so the LLM extraction can curate cited comps from real content.
  if (source.intent === "comparables") {
    return null;
  }

  if (!hostMatchesTarget && !mentionsTarget(source, target)) {
    return "low_relevance";
  }

  return null;
}

function sourceTrace(source: ProviderSource): GenerationSourceTrace {
  return {
    url: source.url,
    title: source.title,
    sourceType: source.sourceType,
    ...(source.intent ? { intent: source.intent } : {})
  };
}

function parseSourceUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    const host = normalizeAuthorityHost(parsed.hostname);
    return { host, root: compactRootLabel(host) };
  } catch {
    return null;
  }
}

// Strip separators so collisions like aurora-data and auroradata collapse to one root.
// Distinct from source-target's aliasRootLabel, which keeps separators for alias splitting.
function compactRootLabel(host: string) {
  return host.split(".")[0]?.replace(/[^a-z0-9]/g, "") ?? "";
}

function looksLikeWrongSameNameDomain(hostRoot: string, targetRoot: string, host: string) {
  if (!hostRoot || !targetRoot || isTrustedSourceGateHost(host)) {
    return false;
  }

  if (hostRoot === targetRoot) {
    return true;
  }

  if (hostRoot.includes(targetRoot) || targetRoot.includes(hostRoot)) {
    return true;
  }

  return Math.abs(hostRoot.length - targetRoot.length) <= 1 && levenshteinDistance(hostRoot, targetRoot) <= 1;
}

function mentionsTarget(source: ProviderSource, target: { targetDomain: string; targetRoot: string; targetAliases: string[]; targetContextTerms: string[] }) {
  const searchable = `${source.title} ${source.rawText}`.toLowerCase();
  return target.targetAliases.some((alias) => mentionsAlias(searchable, alias, target.targetRoot, target.targetContextTerms));
}

function mentionsAlias(searchable: string, alias: string, targetRoot: string, targetContextTerms: string[]) {
  const normalizedAlias = alias.trim().toLowerCase();
  if (!normalizedAlias) {
    return false;
  }

  if (normalizedAlias.includes(".") || normalizedAlias === targetRoot) {
    return searchable.includes(normalizedAlias);
  }

  if (!normalizedAlias.includes(" ") && targetContextTerms.length > 0) {
    return wordBoundaryMatch(searchable, normalizedAlias) &&
      targetContextTerms.some((term) => phraseBoundaryMatch(searchable, term));
  }

  return phraseBoundaryMatch(searchable, normalizedAlias);
}

function wordBoundaryMatch(searchable: string, word: string) {
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(word)}([^a-z0-9]|$)`, "i").test(searchable);
}

function phraseBoundaryMatch(searchable: string, phrase: string) {
  const pattern = phrase
    .split(/\s+/)
    .filter(Boolean)
    .map(escapeRegExp)
    .join("\\s+");
  return new RegExp(`(^|[^a-z0-9])${pattern}([^a-z0-9]|$)`, "i").test(searchable);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function levenshteinDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        (current[rightIndex - 1] ?? 0) + 1,
        (previous[rightIndex] ?? 0) + 1,
        (previous[rightIndex - 1] ?? 0) + substitutionCost
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length] ?? 0;
}
