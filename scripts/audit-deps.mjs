#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const allowedAdvisorySources = new Set([
  1101610,
  1112496,
  1113069,
  1113517,
  1113715,
  1114594,
  1114638,
  1114640,
  1114642,
  1115573,
  1115582,
  1117941,
  1117942,
  1117943,
  1118640,
  1118923,
  1118925,
  1118927,
  1118929,
  1118931,
  1118934,
  1119377,
  1119378,
  1119502,
  1120082,
  1120083,
  1120084,
  1120085,
  1120251,
  1120252,
  1120253,
  1120582,
  1120588,
  1120679,
  1120680,
  1120739,
  1120742,
  1120743,
  1120785,
  1120790,
  1120792,
  1120798,
  1120799,
  1120821,
  1120910,
  1120911,
  1120913,
  1120921,
  1120922,
  // Vercel CLI's @vercel/node hard-pins undici 5.x; keep visible until upstream moves to 6.27+.
  1121242,
  1121245,
  1121250,
  1121255,
  // @opentelemetry/otlp-transformer 0.216.0 (via inngest 3.x) pins protobufjs to exactly 8.0.1;
  // fixed line is 8.5.1+. Cleared by the inngest 4 upgrade; keep visible until then.
  1123487,
  1123489
]);

const result = spawnSync("npm", ["audit", "--omit=dev", "--json"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"]
});

const output = result.stdout.trim();
if (!output) {
  if (result.status === 0) {
    console.log("No production dependency audit findings.");
    process.exit(0);
  }
  process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
}

let report;
try {
  report = JSON.parse(output);
} catch {
  process.stdout.write(output);
  process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
}

const vulnerabilities = Object.values(report.vulnerabilities ?? {});
const vulnerabilitiesByName = new Map(vulnerabilities.map((item) => [item.name, item]));

function advisorySourcesFor(item, seen = new Set()) {
  if (!item || seen.has(item.name)) {
    return [];
  }

  seen.add(item.name);

  return (item.via ?? []).flatMap((via) => {
    if (typeof via === "string") {
      return advisorySourcesFor(vulnerabilitiesByName.get(via), seen);
    }

    return Number.isFinite(via.source) ? [via.source] : [];
  });
}

function unknownAdvisorySourcesFor(item) {
  const sources = advisorySourcesFor(item);
  return sources.length === 0 ? ["unresolved"] : sources.filter((source) => !allowedAdvisorySources.has(source));
}

const unknownFindings = vulnerabilities
  .map((item) => ({ item, unknownSources: unknownAdvisorySourcesFor(item) }))
  .filter(({ unknownSources }) => unknownSources.length > 0);

const blocking = unknownFindings.filter(({ item }) => {
  const severity = item?.severity;
  return severity === "high" || severity === "critical";
});

if (blocking.length > 0) {
  console.error("Blocking dependency audit findings:");
  for (const { item, unknownSources } of blocking) {
    console.error(`- ${item.name} (${item.severity})`);
    console.error(`  unknown advisories: ${unknownSources.join(", ")}`);
  }
  process.exit(1);
}

if (unknownFindings.length > 0) {
  console.warn("Non-blocking dependency audit findings with unknown advisories:");
  for (const { item, unknownSources } of unknownFindings) {
    console.warn(`- ${item.name} (${item.severity}): ${unknownSources.join(", ")}`);
  }
}

const allowedFindings = vulnerabilities.filter((item) =>
  advisorySourcesFor(item).some((source) => allowedAdvisorySources.has(source))
);
const allowedAdvisoryCount = new Set(allowedFindings.flatMap((item) => advisorySourcesFor(item))).size;
console.log(
  `Dependency audit passed with ${allowedFindings.length} findings tied to ${allowedAdvisoryCount} known temporary advisories.`
);
