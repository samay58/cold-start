import type { SourceQualityTier } from "@cold-start/core";
import type { PublicCardSummary } from "@cold-start/db";
import { sourceClassForQualityTier, type CitationSourceClass } from "@cold-start/ui";
import Link from "next/link";
import { connection } from "next/server";
import React from "react";
import { callNumberFor, filedDateStamp, isThinFileFromSourceQualityCounts } from "../../lib/card-face/model";
import { getCachedPublicProfileIndex } from "../../lib/cards";

export const revalidate = 30;

// Reader-facing order, highest evidence quality first: the same priority the sources rail and
// evidence marks already use elsewhere on the card face (independent > reporting > company >
// vendor > unknown).
const EVIDENCE_CLASS_ORDER: CitationSourceClass[] = ["independent", "reporting", "company", "vendor", "unknown"];

const EVIDENCE_CLASS_LABEL: Record<CitationSourceClass, string> = {
  independent: "Independent",
  reporting: "Reporting",
  company: "Company",
  vendor: "Vendor",
  unknown: "Unclassified"
};

function evidenceSignature(
  sourceQualityCounts: Record<SourceQualityTier, number>
): { sourceClass: CitationSourceClass; count: number }[] {
  const counts = new Map<CitationSourceClass, number>();
  for (const [tier, count] of Object.entries(sourceQualityCounts)) {
    const sourceClass = sourceClassForQualityTier(tier as SourceQualityTier);
    counts.set(sourceClass, (counts.get(sourceClass) ?? 0) + count);
  }

  return EVIDENCE_CLASS_ORDER.flatMap((sourceClass) => {
    const count = counts.get(sourceClass) ?? 0;
    return count > 0 ? [{ sourceClass, count }] : [];
  });
}

function EvidenceSignature({ sourceQualityCounts }: Pick<PublicCardSummary, "sourceQualityCounts">) {
  const marks = evidenceSignature(sourceQualityCounts);
  if (marks.length === 0) {
    return null;
  }

  return (
    <span className="cs-catalog-signature">
      {marks.map(({ sourceClass, count }) => (
        <span key={sourceClass} className="cs-catalog-signature-item">
          <span aria-hidden="true" className="cs-catalog-signature-mark" data-class={sourceClass} />
          <span className="sr-only">{EVIDENCE_CLASS_LABEL[sourceClass]} sources: </span>
          {count}
        </span>
      ))}
    </span>
  );
}

function CatalogRow({ row }: { row: PublicCardSummary }) {
  const thin = isThinFileFromSourceQualityCounts(row.sourceQualityCounts);

  return (
    <Link className="cs-catalog-row" href={`/c/${row.slug}`}>
      <div className="cs-catalog-row-top">
        <span className="cs-catalog-row-name">{row.name}</span>
        {thin ? <span className="cs-catalog-row-thin">THIN FILE</span> : null}
      </div>
      <p className="cs-catalog-row-meta">
        {row.domain} · {callNumberFor(row.domain, row.generatedAt)} · filed {filedDateStamp(row.generatedAt)} · {row.sourceCount} source
        {row.sourceCount === 1 ? "" : "s"}
      </p>
      <EvidenceSignature sourceQualityCounts={row.sourceQualityCounts} />
    </Link>
  );
}

export default async function CatalogPage() {
  await connection();
  const profiles = await getCachedPublicProfileIndex();
  const sorted = [...profiles].sort(
    (left, right) => new Date(right.generatedAt).getTime() - new Date(left.generatedAt).getTime()
  );

  return (
    <main className="cs-catalog-plate" id="main-content">
      <div className="cs-catalog-reading">
        <header className="cs-catalog-header">
          <h1 className="cs-catalog-title">The Catalog</h1>
          <p className="cs-catalog-count">
            {profiles.length > 0 ? `${profiles.length} profiles filed` : "No profiles filed yet."}
          </p>
        </header>

        {sorted.length > 0 ? (
          <div className="cs-catalog-panel">
            {sorted.map((row) => (
              <CatalogRow key={row.slug} row={row} />
            ))}
          </div>
        ) : null}
      </div>
    </main>
  );
}
