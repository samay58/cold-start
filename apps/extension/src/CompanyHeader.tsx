import type { ColdStartCard } from "@cold-start/core";
import type { ReactNode } from "react";
import { CompanyLogo } from "./CompanyLogo";
import { readableCompanyName, websiteLabel } from "./company-display";
import { readableCompanyNameFromDomain } from "./extension-config";

export type CompanyHeaderPhase = "intake" | "building" | "profile";

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
  const companyName = card ? readableCompanyName(card) : readableCompanyNameFromDomain(domain);
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
