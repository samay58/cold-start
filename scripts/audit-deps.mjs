#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const allowedAdvisorySources = new Set([
  // @vercel/node and Vercel CLI hard-pin Undici 5.x. Their package contracts reject the patched
  // 6.x branch, so this is the one remaining high-severity production-tree exception. Recheck by
  // 2026-10-14 and remove the whole group when either upstream moves to a patched compatible line.
  1112496,
  1113715,
  1114594,
  1114638,
  1114640,
  1114642,
  1121242,
  1121245,
  1121255,
  1130716,
  1130727,
  1130732,
  1137243
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
