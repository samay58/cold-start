import type { ColdStartCard } from "@cold-start/core";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { CompanyLogo } from "./CompanyLogo";
import { readableCompanyName, sourceLabel, websiteLabel } from "./company-display";
import { formatElapsed, formatOptionalCurrency, formatOptionalNumber } from "./extension-format";
import { fundingEvidenceFromCitations } from "@cold-start/core";
import type { TooltipPlacement, TooltipTriggerProps } from "./SharedTooltip";

export type CompanyHeaderPhase = "intake" | "building" | "profile";

type TooltipPropsFor = (input: { body: string; id: string; placement?: TooltipPlacement; title: string }) => TooltipTriggerProps;

type CompanyHeaderProps = {
  card?: ColdStartCard | null;
  // Rows below the identity band: fact ribbon, people line.
  children?: ReactNode;
  domain: string;
  freshnessLabel?: string | null;
  // Content inside the copy column, under the domain: summary, filed stamp.
  identityChildren?: ReactNode;
  // Small state line above the company name while a run is live.
  kicker?: string | null;
  phase: CompanyHeaderPhase;
  // Right-aligned slot: "No profile" chip at intake, the run timer while building.
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
  kicker,
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
          {kicker ? <p className="cs-company-kicker">{kicker}</p> : null}
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

  return {
    ...preferred,
    sourceUrl: preferred.sourceUrl ?? current.sourceUrl ?? candidate.sourceUrl,
    email: preferred.email ?? current.email ?? candidate.email ?? null,
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

function sentenceCase(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
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

function personTooltipBody(person: CardPerson, companyDomain: string) {
  const emailStatus = person.email
    ? `${sentenceCase(emailKind(person.email, companyDomain))} email found.`
    : "No verified email found yet.";
  const source = sourceHostLabel(person.sourceUrl);

  return [
    `${personRole(person)}.`,
    emailStatus,
    source ? `Source: ${source}.` : null
  ].filter(Boolean).join(" ");
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

export function PeopleLine({
  companyDomain,
  contactElapsedSeconds = 0,
  contactRun,
  confidence,
  people,
  sourceCount,
  tooltipProps
}: {
  companyDomain: string;
  contactElapsedSeconds?: number;
  contactRun?: PeopleRun | undefined;
  confidence?: ColdStartCard["team"]["founders"]["confidence"] | null;
  people: CardPerson[];
  sourceCount: number;
  tooltipProps: TooltipPropsFor;
}) {
  if (people.length === 0) {
    return null;
  }

  const orderedPeople = [
    ...people.filter((person) => person.email),
    ...people.filter((person) => !person.email),
  ];
  const visiblePeople = orderedPeople.slice(0, 4);
  const hiddenPeopleCount = orderedPeople.length - visiblePeople.length;
  const emailCount = peopleEmailCount(people);
  const contactStatus = contactRun
    ? `Checking emails · ${formatElapsed(contactElapsedSeconds)}`
    : peopleEmailSummary(people, companyDomain);
  const confidenceStatus = !contactRun && emailCount > 0 && confidence ? ` · ${confidence} confidence` : "";

  function copyEmail(email: string) {
    void navigator.clipboard?.writeText(email);
  }

  return (
    <section className="cs-people-line" aria-label="Management team">
      <div className="cs-people-line-head">
        <span className="cs-people-line-label">People</span>
        <span className="cs-people-line-source">
          {contactStatus}
          {confidenceStatus}
          {sourceCount > 0 ? ` · ${sourceLabel(sourceCount)}` : ""}
        </span>
      </div>
      <div className="cs-people-line-list">
        {visiblePeople.map((person) => {
          const name = person.name.trim();
          const tooltip = name
            ? tooltipProps({
              body: personTooltipBody(person, companyDomain),
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
                  <span className="cs-person-email">
                    <a href={`mailto:${person.email}`}>{person.email}</a>
                    <span className="cs-person-email-kind">{emailKind(person.email, companyDomain)}</span>
                    <button aria-label={`Copy ${person.email}`} onClick={() => copyEmail(person.email!)} type="button">Copy</button>
                  </span>
                ) : null}
              </span>
              <span className="cs-person-contact-state" aria-hidden="true">
                {person.email ? "@" : ""}
              </span>
            </article>
          );
        })}
        {hiddenPeopleCount > 0 ? (
          <span className="cs-people-more">
            +{hiddenPeopleCount}
          </span>
        ) : null}
      </div>
    </section>
  );
}
