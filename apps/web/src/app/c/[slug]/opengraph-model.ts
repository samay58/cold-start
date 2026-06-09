import type { ColdStartCard } from "@cold-start/core";
import { sourceQualityForSource } from "@cold-start/core";

export type OpenGraphPublicCard = Omit<ColdStartCard, "synthesis">;

export type OpenGraphFact = {
  label: string;
  value: string;
};

export type OpenGraphSourceMix = {
  independent: number;
  reporting: number;
  company: number;
};

export type OpenGraphModel = {
  callNumber: string;
  citations: number;
  description: string;
  domainLabel: string;
  facts: OpenGraphFact[];
  filedLabel: string | null;
  initial: string;
  mix: OpenGraphSourceMix;
  name: string;
  sourceSummary: string;
  titleFontSize: number;
};

const defaultDescription = "Sourced company context card.";

function compactMoney(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  if (value >= 1_000_000_000) {
    return `$${Math.round(value / 100_000_000) / 10}B`;
  }

  if (value >= 1_000_000) {
    return `$${Math.round(value / 1_000_000)}M`;
  }

  if (value >= 1_000) {
    return `$${Math.round(value / 1_000)}K`;
  }

  return `$${value.toLocaleString("en-US")}`;
}

function titleFontSize(name: string) {
  if (name.length <= 14) {
    return 118;
  }

  if (name.length <= 24) {
    return 104;
  }

  if (name.length <= 36) {
    return 88;
  }

  if (name.length <= 52) {
    return 72;
  }

  return 62;
}

function statusLabel(status: OpenGraphPublicCard["identity"]["status"] | undefined) {
  if (!status) {
    return "Private";
  }

  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}

function trimDescription(value: string) {
  const compacted = value.replace(/\s+/g, " ").trim();
  if (compacted.length <= 154) {
    return compacted;
  }

  const trimmed = compacted.slice(0, 151).replace(/\s+\S*$/, "").trim();
  return `${trimmed}...`;
}

function imageDescription(card: OpenGraphPublicCard | null) {
  return trimDescription(card?.identity.description?.value?.shortDescription ?? card?.identity.oneLiner.value ?? defaultDescription);
}

function nameFromSlug(slug: string) {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ") || "Cold Start";
}

function initialForName(name: string) {
  return (name.trim().charAt(0) || "C").toUpperCase();
}

function hqLabel(card: OpenGraphPublicCard | null) {
  const hq = card?.identity.hq.value;
  if (!hq) {
    return null;
  }

  return [hq.city, hq.country].filter(Boolean).join(", ");
}

function factCandidates(card: OpenGraphPublicCard | null, citations: number): OpenGraphFact[] {
  const funding = compactMoney(card?.funding.totalRaisedUsd.value);
  const lastRound = card?.funding.lastRound.value?.name ?? null;
  const hq = hqLabel(card);
  const status = statusLabel(card?.identity.status);

  return [
    funding ? { label: "Raised", value: funding } : null,
    lastRound ? { label: "Round", value: lastRound } : null,
    hq ? { label: "HQ", value: hq } : null,
    { label: "Sources", value: String(citations) },
    { label: "Status", value: status },
  ].filter((fact): fact is OpenGraphFact => Boolean(fact)).slice(0, 4);
}

function filedLabel(card: OpenGraphPublicCard | null) {
  const generatedAt = card?.generatedAt;
  if (!generatedAt) {
    return null;
  }

  const parsed = new Date(generatedAt);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).format(parsed).replace(",", "");
}

function sourceMix(card: OpenGraphPublicCard | null): OpenGraphSourceMix {
  const mix = { independent: 0, reporting: 0, company: 0 };

  for (const citation of card?.citations ?? []) {
    const tier = (citation.sourceQuality ?? sourceQualityForSource(citation)).tier;
    if (tier === "independent_technical" || tier === "independent_analysis") {
      mix.independent += 1;
    } else if (tier === "independent_report") {
      mix.reporting += 1;
    } else {
      mix.company += 1;
    }
  }

  return mix;
}

export function buildOpenGraphModel(card: OpenGraphPublicCard | null, slug: string): OpenGraphModel {
  const name = card?.identity.name.value?.trim() || nameFromSlug(slug);
  const citations = card?.citations.length ?? 0;

  return {
    callNumber: `CS · ${slug.toUpperCase()}`,
    citations,
    description: imageDescription(card),
    domainLabel: card?.domain ?? "public company card",
    facts: factCandidates(card, citations),
    filedLabel: filedLabel(card),
    initial: initialForName(name),
    mix: sourceMix(card),
    name,
    sourceSummary: `${citations} cited ${citations === 1 ? "source" : "sources"}, via Cold Start.`,
    titleFontSize: titleFontSize(name),
  };
}
