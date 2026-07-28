#!/usr/bin/env node

// Publishes a Mozilla-signed XPI through the self-hosted update lane: copies it
// into apps/web/public/firefox/ under its versioned name plus the stable
// cold-start.xpi the invite page links, and stamps the version into updates.json
// (Firefox's update manifest; unlisted builds get no AMO update hosting). The
// update_link and sha256 update_hash follow the format on
// extensionworkshop.com/documentation/manage/updating-your-extension/.
// Commit and deploy afterwards; nothing reaches testers until the web app ships.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicFirefoxDir = path.join(repoRoot, "apps", "web", "public", "firefox");
const updatesPath = path.join(publicFirefoxDir, "updates.json");
const GECKO_ID = "cold-start@semitechie.vc";
const PUBLIC_ORIGIN = "https://cold-start.semitechie.vc";

function main() {
  const xpiArg = process.argv[2];
  if (!xpiArg) {
    fail("Usage: npm run release:firefox -- <path-to-signed.xpi>");
  }
  const xpiPath = path.resolve(process.cwd(), xpiArg);
  if (!fs.existsSync(xpiPath)) {
    fail(`No file at ${xpiPath}`);
  }

  const manifest = manifestFromXpi(xpiPath);
  assert(manifest.browser_specific_settings?.gecko?.id === GECKO_ID, "XPI gecko id does not match the extension.");
  const version = manifest.version;
  assert(/^\d+(?:\.\d+){1,3}$/.test(String(version)), `Unexpected XPI version: ${String(version)}`);

  const data = fs.readFileSync(xpiPath);
  const hash = createHash("sha256").update(data).digest("hex");
  const versionedName = `cold-start-${version}.xpi`;

  fs.mkdirSync(publicFirefoxDir, { recursive: true });
  fs.writeFileSync(path.join(publicFirefoxDir, versionedName), data);
  // Stable name for the invite page's download link; always the newest release.
  fs.writeFileSync(path.join(publicFirefoxDir, "cold-start.xpi"), data);

  const updates = readUpdates();
  const entries = updates.addons[GECKO_ID].updates.filter((entry) => entry.version !== version);
  entries.push({
    version,
    update_link: `${PUBLIC_ORIGIN}/firefox/${versionedName}`,
    update_hash: `sha256:${hash}`
  });
  entries.sort((left, right) => compareVersions(left.version, right.version));
  updates.addons[GECKO_ID].updates = entries;
  fs.writeFileSync(updatesPath, `${JSON.stringify(updates, null, 2)}\n`, "utf8");

  process.stdout.write(`Published ${versionedName} (sha256 ${hash.slice(0, 12)}…) and updated updates.json.\n`);
  process.stdout.write("Now commit apps/web/public/firefox and deploy; testers update on the next Firefox check.\n");
}

function manifestFromXpi(xpiPath) {
  try {
    const raw = execFileSync("unzip", ["-p", xpiPath, "manifest.json"], { encoding: "utf8" });
    return JSON.parse(raw);
  } catch (error) {
    fail(`Could not read manifest.json from the XPI: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function readUpdates() {
  const fallback = { addons: { [GECKO_ID]: { updates: [] } } };
  if (!fs.existsSync(updatesPath)) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(updatesPath, "utf8"));
    if (parsed?.addons?.[GECKO_ID]?.updates && Array.isArray(parsed.addons[GECKO_ID].updates)) {
      return parsed;
    }
  } catch {
    // fall through to the fresh shape
  }
  return fallback;
}

function compareVersions(left, right) {
  const leftParts = String(left).split(".").map(Number);
  const rightParts = String(right).split(".").map(Number);
  for (let index = 0; index < 4; index += 1) {
    const delta = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (delta !== 0) {
      return delta;
    }
  }
  return 0;
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function fail(message) {
  process.stderr.write(`Firefox release failed: ${message}\n`);
  process.exit(1);
}

main();
