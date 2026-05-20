const coreFieldChecks = [
  ["identity.name", (card) => card?.identity?.name?.value],
  ["identity.oneLiner", (card) => card?.identity?.oneLiner?.value],
  ["funding.totalRaisedUsd", (card) => card?.funding?.totalRaisedUsd?.value],
  ["team.founders", (card) => {
    const founders = card?.team?.founders?.value;
    return Array.isArray(founders) && founders.length > 0 ? founders : null;
  }]
];

export function scoreEvalResult(result) {
  const publicCard = result.publicCard ?? null;
  const extensionCard = result.extensionCard ?? null;
  const missingCoreFields = coreFieldChecks
    .filter(([, read]) => !read(publicCard))
    .map(([path]) => path);
  const citations = Array.isArray(publicCard?.citations) ? publicCard.citations : [];
  const citationUrlFailures = citations.filter((citation) => {
    try {
      const url = new URL(citation.url);
      return url.protocol !== "http:" && url.protocol !== "https:";
    } catch {
      return true;
    }
  }).length;
  const publicSynthesisLeak = Boolean(publicCard && Object.hasOwn(publicCard, "synthesis"));
  const extensionSynthesisPresent = Boolean(extensionCard?.synthesis);
  const providerFailureReason = result.providerFailureReason ?? result.runStatus?.error ?? null;
  const needsManualReview =
    missingCoreFields.length > 0 ||
    citationUrlFailures > 0 ||
    publicSynthesisLeak ||
    !extensionSynthesisPresent ||
    Boolean(providerFailureReason);

  return {
    company: result.company.name,
    domain: result.company.domain,
    category: result.company.category,
    latencyMs: result.latencyMs,
    publicSynthesisLeak,
    extensionSynthesisPresent,
    missingCoreFields,
    citationUrlFailures,
    providerFailureReason,
    needsManualReview
  };
}

export async function runGoldenEval({ companies, limit = companies.length, client }) {
  const selected = companies.slice(0, limit);
  const rows = [];

  for (const company of selected) {
    const result = await client.generateAndFetch(company);
    rows.push(scoreEvalResult(result));
  }

  return {
    generatedAt: new Date().toISOString(),
    rows,
    summary: summarizeRows(rows)
  };
}

function summarizeRows(rows) {
  return {
    total: rows.length,
    publicSynthesisLeaks: rows.filter((row) => row.publicSynthesisLeak).length,
    extensionSynthesisMissing: rows.filter((row) => !row.extensionSynthesisPresent).length,
    citationUrlFailures: rows.reduce((sum, row) => sum + row.citationUrlFailures, 0),
    rowsNeedingManualReview: rows.filter((row) => row.needsManualReview).length
  };
}

export function markdownSummary(run) {
  const lines = [
    "# Cold Start Golden Eval",
    "",
    `Generated: ${run.generatedAt}`,
    "",
    "| Company | Domain | Latency | Missing core fields | Extension synthesis | Public leak | Citation URL failures | Provider/run error |",
    "|---|---:|---:|---|---:|---:|---:|---|"
  ];

  for (const row of run.rows) {
    lines.push(
      [
        row.company,
        row.domain,
        String(row.latencyMs ?? ""),
        row.missingCoreFields.join(", ") || "-",
        row.extensionSynthesisPresent ? "yes" : "no",
        row.publicSynthesisLeak ? "yes" : "no",
        String(row.citationUrlFailures),
        row.providerFailureReason ?? "-"
      ].join(" | ").replace(/^/, "| ").replace(/$/, " |")
    );
  }

  lines.push(
    "",
    `Manual review rows: ${run.summary.rowsNeedingManualReview}/${run.summary.total}`,
    `Public synthesis leaks: ${run.summary.publicSynthesisLeaks}`,
    `Missing extension synthesis: ${run.summary.extensionSynthesisMissing}`,
    `Citation URL failures: ${run.summary.citationUrlFailures}`
  );

  return `${lines.join("\n")}\n`;
}
