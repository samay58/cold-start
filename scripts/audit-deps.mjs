#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const allowed = new Set([
  "@crxjs/vite-plugin",
  "@opentelemetry/auto-instrumentations-node",
  "@opentelemetry/exporter-logs-otlp-grpc",
  "@opentelemetry/exporter-logs-otlp-http",
  "@opentelemetry/exporter-logs-otlp-proto",
  "@opentelemetry/exporter-metrics-otlp-grpc",
  "@opentelemetry/exporter-metrics-otlp-http",
  "@opentelemetry/exporter-metrics-otlp-proto",
  "@opentelemetry/exporter-prometheus",
  "@opentelemetry/exporter-trace-otlp-grpc",
  "@opentelemetry/exporter-trace-otlp-http",
  "@opentelemetry/exporter-trace-otlp-proto",
  "@opentelemetry/otlp-exporter-base",
  "@opentelemetry/otlp-grpc-exporter-base",
  "@opentelemetry/otlp-transformer",
  "@opentelemetry/sdk-node",
  "@vercel/build-utils",
  "@vercel/node",
  "@vercel/python-analysis",
  "@vercel/static-config",
  "ajv",
  "ethers",
  "inngest",
  "minimatch",
  "next",
  "path-to-regexp",
  "postcss",
  "protobufjs",
  "qs",
  "rollup",
  "smol-toml",
  "undici",
  "viem",
  "ws"
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
const blocking = vulnerabilities.filter((item) => {
  const severity = item?.severity;
  return (severity === "high" || severity === "critical") && !allowed.has(item.name);
});

if (blocking.length > 0) {
  console.error("Blocking dependency audit findings:");
  for (const item of blocking) {
    console.error(`- ${item.name} (${item.severity})`);
  }
  process.exit(1);
}

const allowedFindings = vulnerabilities.filter((item) => allowed.has(item.name));
console.log(`Dependency audit passed with ${allowedFindings.length} temporary allowed findings.`);
