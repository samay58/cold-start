import type { ColdStartCard } from "@cold-start/core";
import { motion } from "framer-motion";
import { useState } from "react";
import type { ReactNode } from "react";
import { CompanyLogo } from "./CompanyLogo";
import { readableCompanyName, sourceLabel, websiteLabel } from "./company-display";
import { formatElapsed, formatOptionalCurrency, formatOptionalNumber } from "./extension-format";
import { fundingEvidenceFromCitations } from "@cold-start/core";
import type { TooltipDossier, TooltipPropsFor } from "./SharedTooltip";

type CompanyHeaderPhase = "intake" | "building" | "profile";

type CompanyHeaderProps = {
  card?: ColdStartCard | null;
  // Rows below the identity band: fact ribbon, people line.
  children?: ReactNode;
  domain: string;
  freshnessLabel?: string | null;
  // Content inside the copy column, under the domain: summary, filed stamp.
  identityChildren?: ReactNode;
  phase: CompanyHeaderPhase;
  // Right-aligned slot: "No profile" chip at intake, the assembly whisper while building.
  statusSlot?: ReactNode;
};

// The one identity band for the whole arc. It mounts when the company is identified and
// never remounts across intake -> building -> profile; only its slots change.
export function CompanyHeader({
  card,
  children,
  domain,
  freshnessLabel,
  identityChildren,
  phase,
  statusSlot
}: CompanyHeaderProps) {
  const companyName = card ? readableCompanyName(card) : readableCompanyNameFallback(domain);
  const website = card ? websiteLabel(card) : domain.replace(/^www\./i, "");

  return (
    <section className="cs-company-context" aria-label="Company context" data-phase={phase}>
      <div className="cs-company-context-main">
        <CompanyLogo
          className="cs-company-logo"
          domain={domain}
          label={companyName}
          logoUrl={card?.identity.logoUrl ?? null}
        />
        <div>
          <h1>{companyName}</h1>
          <a className="cs-company-domain" href={`https://${domain}`} rel="noreferrer" target="_blank">
            {website}
          </a>
          {freshnessLabel ? <span className="cs-freshness-mark">{freshnessLabel}</span> : null}
          {identityChildren}
        </div>
        {statusSlot ? <div className="cs-company-status-slot">{statusSlot}</div> : null}
      </div>
      {children}
    </section>
  );
}

function readableCompanyNameFallback(domain: string) {
  const root = domain.replace(/^www\./i, "").split(".")[0] ?? domain;
  return root
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ") || domain;
}

export function ProfileSummary({
  fullSummary,
  summary,
  tooltipProps
}: {
  fullSummary: string;
  summary: string;
  tooltipProps: TooltipPropsFor;
}) {
  const hasMore = fullSummary !== summary;
  return (
    <div className="cs-company-summary-wrap">
      {hasMore ? (
        <p className="cs-company-summary">
          {summary}{" "}
          <button
            aria-label="Read the full company description"
            className="cs-company-summary-more"
            type="button"
            {...tooltipProps({
              body: fullSummary,
              id: "profile-summary",
              placement: "below",
              title: "Description"
            })}
          >
            (more)
          </button>
        </p>
      ) : (
        <p className="cs-company-summary">{summary}</p>
      )}
    </div>
  );
}

export function SourcesCheckedStamp({
  prefersReducedMotion,
  sourceCount
}: {
  prefersReducedMotion: boolean;
  sourceCount: number;
}) {
  const meta = sourceCount > 0 ? sourceLabel(sourceCount) : "Filed with sources";

  return (
    <motion.div
      aria-label="Sources checked"
      animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
      className="cs-early-read-filed"
      initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 8 }}
      layout
      layoutId="sources-checked"
      transition={prefersReducedMotion ? { duration: 0.12, ease: "easeOut" } : { duration: 0.52, ease: [0.21, 1, 0.35, 1] }}
    >
      <span className="cs-early-read-filed-stamp">Sources checked</span>
      <span className="cs-early-read-filed-meta">{meta}</span>
    </motion.div>
  );
}

type CardPerson = NonNullable<ColdStartCard["team"]["keyExecs"]["value"]>[number];

function roleScore(role: string | null) {
  const normalized = role?.toLowerCase() ?? "";
  let score = 0;

  if (normalized.includes("ceo")) {
    score += 5;
  }
  if (normalized.includes("co-founder") || normalized.includes("cofounder")) {
    score += 4;
  }
  if (normalized.includes("founder")) {
    score += 3;
  }
  if (normalized.includes("chief")) {
    score += 2;
  }
  if (normalized.includes("president") || normalized.includes("editor") || normalized.includes("operating")) {
    score += 1;
  }
  if (normalized.includes("prev.") || normalized.includes("previous")) {
    score -= 2;
  }

  return score;
}

function preferredPerson(current: CardPerson, candidate: CardPerson): CardPerson {
  const currentScore = roleScore(current.role);
  const candidateScore = roleScore(candidate.role);
  let preferred = current;

  if (candidateScore !== currentScore) {
    preferred = candidateScore > currentScore ? candidate : current;
  } else {
    const currentRoleLength = current.role?.length ?? 0;
    const candidateRoleLength = candidate.role?.length ?? 0;

    if (candidateRoleLength === 0) {
      preferred = current;
    } else if (currentRoleLength === 0) {
      preferred = candidate;
    } else {
      preferred = candidateRoleLength < currentRoleLength ? candidate : current;
    }
  }

  // Prefer any real (non-inferred) address over an inferred guess when the same person
  // appears in both lists, mirroring the pipeline merge.
  const emailPick = [preferred, current, candidate].find((person) => person.email && person.emailStatus !== "inferred")
    ?? [preferred, current, candidate].find((person) => person.email);

  return {
    ...preferred,
    sourceUrl: preferred.sourceUrl ?? current.sourceUrl ?? candidate.sourceUrl,
    email: emailPick?.email ?? null,
    emailStatus: emailPick?.emailStatus ?? null,
    githubUrl: preferred.githubUrl ?? current.githubUrl ?? candidate.githubUrl ?? null,
    xUrl: preferred.xUrl ?? current.xUrl ?? candidate.xUrl ?? null,
    personalUrl: preferred.personalUrl ?? current.personalUrl ?? candidate.personalUrl ?? null,
  };
}

export function managementPeople(card: ColdStartCard): CardPerson[] {
  const byName = new Map<string, CardPerson>();
  const people = [...(card.team.founders.value ?? []), ...(card.team.keyExecs.value ?? [])];

  for (const person of people) {
    const key = person.name.trim().toLowerCase();
    const current = byName.get(key);

    if (!current) {
      byName.set(key, person);
      continue;
    }

    byName.set(key, preferredPerson(current, person));
  }

  return Array.from(byName.values());
}

export function managementSourceCount(card: ColdStartCard) {
  return new Set([
    ...card.team.founders.citationIds,
    ...card.team.keyExecs.citationIds
  ]).size;
}

function personRole(person: CardPerson) {
  return person.role?.trim() || "Role not verified";
}

function personInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = parts.length >= 2
    ? `${parts[0]?.charAt(0) ?? ""}${parts[parts.length - 1]?.charAt(0) ?? ""}`
    : parts[0]?.slice(0, 2) ?? "";

  return initials.toUpperCase() || "P";
}

function peopleEmailCount(people: CardPerson[]) {
  return people.filter((person) => person.email).length;
}

function emailKind(email: string, companyDomain: string) {
  const domain = email.split("@")[1]?.toLowerCase().replace(/^www\./, "") ?? "";
  const targetDomain = companyDomain.toLowerCase().replace(/^www\./, "");
  if (domain === targetDomain) {
    return "work";
  }
  if (["gmail.com", "icloud.com", "me.com", "outlook.com", "hotmail.com", "yahoo.com", "proton.me", "protonmail.com"].includes(domain)) {
    return "personal";
  }
  return "other domain";
}

function sourceHostLabel(sourceUrl: string | null | undefined) {
  if (!sourceUrl) {
    return null;
  }

  try {
    return new URL(sourceUrl).hostname.replace(/^www\./i, "");
  } catch {
    return null;
  }
}

type PersonChannel = { label: "GitHub" | "X" | "Site"; url: string };

function personChannels(person: CardPerson): PersonChannel[] {
  return [
    person.githubUrl ? { label: "GitHub" as const, url: person.githubUrl } : null,
    person.xUrl ? { label: "X" as const, url: person.xUrl } : null,
    person.personalUrl ? { label: "Site" as const, url: person.personalUrl } : null
  ].filter((channel): channel is PersonChannel => channel !== null);
}

// Minimal citation shape the dossier needs to resolve a read's sources to their hosts. The
// card's full `citations[]` is assignable to this.
type CitationRef = { id: string; url: string };

function formatProvenance(hosts: string[]): string | null {
  const unique = [...new Set(hosts)];
  return unique.length > 0 ? `via ${unique.join(", ")}` : null;
}

// A whisper of the person's public sources: the host of every channel plus the source
// that placed them on the card, deduped. The honest fallback when no cited read exists.
function personProvenance(person: CardPerson): string | null {
  const hosts = [person.sourceUrl, person.githubUrl, person.xUrl, person.personalUrl]
    .map((url) => sourceHostLabel(url))
    .filter((host): host is string => Boolean(host));
  return formatProvenance(hosts);
}

// When a cited read exists, its provenance is the read's own citations resolved to their
// hosts, not the person's channel hosts. This keeps the whisper honest: it names where the
// claim came from, never a channel link masquerading as the read's source.
function readProvenance(read: NonNullable<CardPerson["read"]>, citations: readonly CitationRef[]): string | null {
  const byId = new Map(citations.map((citation) => [citation.id, citation] as const));
  const hosts = read.citationIds
    .map((id) => byId.get(id))
    .map((citation) => (citation ? sourceHostLabel(citation.url) : null))
    .filter((host): host is string => Boolean(host));
  return formatProvenance(hosts);
}

function personDossier(person: CardPerson, citations: readonly CitationRef[]): TooltipDossier {
  const email = person.email
    ? { address: person.email, status: person.emailStatus === "inferred" ? ("inferred" as const) : ("observed" as const) }
    : null;
  const read = person.read ?? null;

  return {
    kind: "dossier",
    name: person.name.trim(),
    role: person.role?.trim() || null,
    read,
    provenance: read ? readProvenance(read, citations) : personProvenance(person),
    email,
    channels: personChannels(person)
  };
}

function peopleEmailSummary(people: CardPerson[], companyDomain: string) {
  const emails = people.flatMap((person) => person.email ? [person.email] : []);
  if (emails.length === 0) {
    return "No verified email found";
  }

  const workCount = emails.filter((email) => emailKind(email, companyDomain) === "work").length;
  if (workCount === emails.length) {
    return `${workCount} work email${workCount === 1 ? "" : "s"}`;
  }
  return `${emails.length} email${emails.length === 1 ? "" : "s"} found`;
}

export function managementConfidence(card: ColdStartCard) {
  const confidenceRank = { high: 3, medium: 2, low: 1 } as const;
  return [card.team.founders, card.team.keyExecs]
    .filter((fact) => (fact.value ?? []).some((person) => person.email))
    .map((fact) => fact.confidence)
    .sort((left, right) => confidenceRank[right] - confidenceRank[left])[0] ?? null;
}

export function profileFacts(card: ColdStartCard): Array<{ label: string; value: string; meta?: string | undefined }> {
  const hq = card.identity.hq.value;
  const headcount = card.team.headcount.value;
  const lastRoundFact = card.funding.lastRound;
  const lastRound = lastRoundFact.value;
  const lastRoundAmount = formatOptionalCurrency(lastRound?.amountUsd);
  const totalRaised = formatOptionalCurrency(card.funding.totalRaisedUsd.value);
  const citationFunding = fundingEvidenceFromCitations(card).find((item) => item.amountLabel);
  const facts: Array<{ label: string; value: string; meta?: string | undefined }> = [];

  const employees = formatOptionalNumber(headcount?.value);
  if (employees) {
    facts.push({
      label: "Employees",
      value: employees,
      ...(headcount?.asOf ? { meta: headcount.asOf } : {})
    });
  }

  if (lastRound?.name === "Reported financing" && lastRoundAmount && lastRoundFact.status === "inferred") {
    facts.push({
      label: "Funding",
      value: lastRoundAmount,
      meta: "reported"
    });
  } else if (lastRound?.name) {
    facts.push({
      label: "Round",
      value: lastRound.name,
      ...(lastRoundAmount ? { meta: lastRoundAmount } : {})
    });
  } else if (totalRaised) {
    facts.push({ label: "Raised", value: totalRaised });
  } else if (citationFunding?.amountLabel) {
    facts.push({
      label: "Funding",
      value: citationFunding.amountLabel,
      meta: citationFunding.status === "closed" ? "reported" : "reported target"
    });
  }

  if (hq?.city || hq?.country) {
    facts.push({ label: "HQ", value: [hq.city, hq.country].filter(Boolean).join(", ") });
  } else if (card.identity.foundedYear.value) {
    facts.push({ label: "Founded", value: String(card.identity.foundedYear.value) });
  }

  return facts.slice(0, 3);
}

export function FactRibbon({ facts }: { facts: ReturnType<typeof profileFacts> }) {
  if (facts.length === 0) {
    return null;
  }

  return (
    <dl className="cs-company-facts" aria-label="Core metrics">
      {facts.map((fact) => (
        <div key={fact.label}>
          <dt>{fact.label}</dt>
          <dd>{fact.value}</dd>
          {fact.meta ? <small>{fact.meta}</small> : null}
        </div>
      ))}
    </dl>
  );
}

type PeopleRun = {
  generationStatus: "queued" | "running";
  startedAt: number;
};

const PEOPLE_COLLAPSED_COUNT = 4;

export function PeopleLine({
  citations,
  companyDomain,
  contactElapsedSeconds = 0,
  contactRun,
  confidence,
  people,
  tooltipProps
}: {
  // The card's citations, so a person's cited read can resolve its provenance whisper.
  citations: readonly CitationRef[];
  companyDomain: string;
  contactElapsedSeconds?: number;
  contactRun?: PeopleRun | undefined;
  confidence?: ColdStartCard["team"]["founders"]["confidence"] | null;
  people: CardPerson[];
  // The filed stamp owns the source count now; PeopleLine no longer prints it, but the
  // caller still supplies it so the prop stays on the contract.
  sourceCount: number;
  tooltipProps: TooltipPropsFor;
}) {
  const [expanded, setExpanded] = useState(false);

  if (people.length === 0) {
    return null;
  }

  const orderedPeople = [
    ...people.filter((person) => person.email),
    ...people.filter((person) => !person.email),
  ];
  const hiddenPeopleCount = Math.max(0, orderedPeople.length - PEOPLE_COLLAPSED_COUNT);
  const visiblePeople = expanded ? orderedPeople : orderedPeople.slice(0, PEOPLE_COLLAPSED_COUNT);
  const emailCount = peopleEmailCount(people);
  const contactStatus = contactRun
    ? `Checking emails · ${formatElapsed(contactElapsedSeconds)}`
    : peopleEmailSummary(people, companyDomain);
  const confidenceStatus = !contactRun && emailCount > 0 && confidence ? ` · ${confidence} confidence` : "";

  return (
    <section className="cs-people-line" aria-label="Management team">
      <div className="cs-people-line-head">
        <span className="cs-people-line-source">
          {contactStatus}
          {confidenceStatus}
        </span>
      </div>
      <div className="cs-people-line-list">
        {visiblePeople.map((person) => {
          const name = person.name.trim();
          const tooltip = name
            ? tooltipProps({
              body: personDossier(person, citations),
              id: `person-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
              placement: "above",
              title: name
            })
            : undefined;

          return (
            <article
              className="cs-people-person"
              data-has-email={person.email ? "true" : "false"}
              key={`${person.name}-${person.email ?? person.role ?? "person"}`}
              tabIndex={tooltip ? 0 : undefined}
              {...tooltip}
            >
              <span className="cs-person-avatar" aria-hidden="true">{personInitials(person.name)}</span>
              <span className="cs-person-main">
                <span className="cs-people-name">{person.name}</span>
                <span className="cs-people-role">{personRole(person)}</span>
                {person.email ? (
                  <span
                    className="cs-person-email"
                    data-email-status={person.emailStatus ?? "observed"}
                  >
                    <a href={`mailto:${person.email}`}>{person.email}</a>
                  </span>
                ) : null}
              </span>
            </article>
          );
        })}
        {hiddenPeopleCount > 0 ? (
          <button
            aria-expanded={expanded}
            aria-label={expanded ? "Show fewer people" : `Show ${hiddenPeopleCount} more people`}
            className="cs-people-more"
            onClick={() => setExpanded((value) => !value)}
            type="button"
          >
            {expanded ? "Show fewer" : `+${hiddenPeopleCount}`}
          </button>
        ) : null}
      </div>
    </section>
  );
}
