#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const ignoredDirectories = new Set([
  ".git",
  ".next",
  ".pytest_cache",
  ".specstory",
  ".venv",
  ".vercel",
  ".worktrees",
  "coverage",
  "dist",
  "dist-dev",
  "node_modules",
  "playwright-report",
  "test-results"
]);
const knownDevSentinels = new Set([
  "local-extension-token",
  "local-dev"
]);
const ignoredFiles = new Set([
  "package-lock.json"
]);
const ignoredExtensions = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".mp4",
  ".zip",
  ".epub",
  ".pdf"
]);

const patterns = [
  // Require a word boundary before sk- so the pattern does not match mid-word, e.g. the "sk-" inside
  // "elon-musk-is-betting-..." URL slugs in scraped eval fixtures. Real keys are standalone tokens
  // (preceded by whitespace, quote, =, :, or start), so the boundary never drops a genuine key.
  { label: "OpenAI API key", regex: /\bsk-[A-Za-z0-9_-]{32,}/g },
  { label: "Anthropic API key", regex: /\bsk-ant-[A-Za-z0-9_-]{32,}/g },
  { label: "GitHub token", regex: /gh[pousr]_[A-Za-z0-9_]{30,}/g },
  { label: "Vercel token", regex: /\b[A-Za-z0-9]{24}_[A-Za-z0-9]{24}\b/g },
  { label: "Private key block", regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  // Cold Start specific tokens. Flag tracked source copies instead of .env files.
  // Capture the value so we can filter out known dev sentinels and template placeholders.
  // Whitespace classes intentionally exclude newlines so the value capture stays on one line.
  // Optional quote handling catches both KEY=value and KEY="value" forms commonly found in docs.
  { label: "AgentCash wallet private key", regex: /X402_PRIVATE_KEY[ \t]*=[ \t]*["']?(0x[0-9a-fA-F]{40,})["']?/g, capture: 1 },
  { label: "Cold Start extension API token", regex: /EXTENSION_API_TOKEN[ \t]*=[ \t]*["']?([A-Za-z0-9_-]{20,})["']?/g, capture: 1 },
  { label: "Direct Exa API key", regex: /DIRECT_EXA_API_KEY[ \t]*=[ \t]*["']?([A-Za-z0-9_-]{20,})["']?/g, capture: 1 },
  { label: "Exa Websets API key", regex: /EXA_WEBSETS_API_KEY[ \t]*=[ \t]*["']?([A-Za-z0-9_-]{20,})["']?/g, capture: 1 },
  // Generic ethereum private key pattern (for any other 0x-prefixed wallet key that lands in source).
  { label: "Ethereum-style private key", regex: /\b0x[0-9a-fA-F]{64}\b/g }
];

function isLikelyPlaceholderOrSentinel(value) {
  if (!value) return false;
  if (knownDevSentinels.has(value)) return true;
  // Template forms like <long-random-token> or {{TOKEN}}.
  if (value.includes("<") || value.includes(">") || value.includes("{") || value.includes("}")) return true;
  // Markdown regex documentation (the secrets-check script's own pattern strings).
  if (/^[A-Za-z0-9_-]{20,}\}$/.test(value)) return true;
  return false;
}

async function* walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = path.relative(root, absolutePath);

    if (entry.isDirectory()) {
      if (ignoredDirectories.has(entry.name) || relativePath.startsWith("eval/activegraph-runs")) {
        continue;
      }
      yield* walk(absolutePath);
      continue;
    }

    if (!entry.isFile() || ignoredFiles.has(entry.name) || ignoredExtensions.has(path.extname(entry.name).toLowerCase())) {
      continue;
    }

    if (entry.name === ".env" || entry.name.startsWith(".env.")) {
      continue;
    }

    yield { absolutePath, relativePath };
  }
}

const findings = [];

for await (const file of walk(root)) {
  let text;
  try {
    text = await readFile(file.absolutePath, "utf8");
  } catch {
    continue;
  }

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern.regex)) {
      const captured = pattern.capture !== undefined ? match[pattern.capture] : match[0];
      if (isLikelyPlaceholderOrSentinel(captured)) {
        continue;
      }
      const start = match.index ?? 0;
      const line = text.slice(0, start).split("\n").length;
      findings.push(`${file.relativePath}:${line} ${pattern.label}`);
    }
  }
}

if (findings.length > 0) {
  console.error("Potential secrets found:");
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log("No obvious secrets found.");
