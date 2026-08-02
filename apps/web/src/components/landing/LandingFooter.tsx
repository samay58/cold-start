import React from "react";
import { formatMediumDate } from "@cold-start/ui";

export type LandingFooterProps = {
  count: number;
  latestGeneratedAt: string | null;
};

export function LandingFooter({ count, latestGeneratedAt }: LandingFooterProps) {
  return (
    <footer className="cs-landing-footer">
      <span className="cs-landing-footer-receipt">
        Cold Start · {count} profiles filed
        {latestGeneratedAt ? ` · last filing ${formatMediumDate(latestGeneratedAt)}` : ""}
      </span>
      <span className="cs-landing-footer-disclaimer">Public facts, cited. Not investment advice.</span>
    </footer>
  );
}
