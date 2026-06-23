import {
  isTrustedSourceGateHost,
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
  sources: ProviderSource[];
}): SourceGateResult {
  const accepted: ProviderSource[] = [];
  const rejected: SourceGateResult["rejected"] = [];
  const targetDomain = normalizeHost(input.domain);
  const targetRoot = rootLabel(targetDomain);

  for (const source of input.sources) {
    const reason = sourceRejectionReason(source, { targetDomain, targetRoot });
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
  target: { targetDomain: string; targetRoot: string }
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

    const host = normalizeHost(parsed.hostname);
    return { host, root: rootLabel(host) };
  } catch {
    return null;
  }
}

function normalizeHost(value: string) {
  return value.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0]?.toLowerCase() ?? "";
}

function rootLabel(host: string) {
  return host.split(".")[0]?.replace(/[^a-z0-9]/g, "") ?? "";
}

function isTrustedSourceGateHostForAmbiguity(host: string) {
  return isTrustedSourceGateHost(host);
}

function looksLikeWrongSameNameDomain(hostRoot: string, targetRoot: string, host: string) {
  if (!hostRoot || !targetRoot || isTrustedSourceGateHostForAmbiguity(host)) {
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

function mentionsTarget(source: ProviderSource, target: { targetDomain: string; targetRoot: string }) {
  const searchable = `${source.title} ${source.rawText}`.toLowerCase();
  return searchable.includes(target.targetDomain) || searchable.includes(target.targetRoot);
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
