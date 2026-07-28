#!/usr/bin/env node

// Unlisted AMO signing lane. Order matters: the packager proves the build is the
// reviewed production surface (clean commit, pinned env, manifest inspection,
// deterministic double-buildable), the source packager freezes the matching
// reviewer source, then web-ext signs dist-firefox and attaches that source zip
// to the submission. Credentials come only from the environment
// (WEB_EXT_API_KEY / WEB_EXT_API_SECRET, created at addons.mozilla.org → Tools →
// Manage API Keys); they are never written to disk here.
//
// Expect up to 24 hours for automated signing; any version can be pulled into
// manual review (up to ~2 weeks). Every signing needs a version bump first:
//   npm version patch --no-git-tag-version -w @cold-start/extension
//   npm install --package-lock-only
// After the signed XPI lands in apps/extension/web-ext-artifacts/, publish it:
//   npm run release:firefox -- apps/extension/web-ext-artifacts/<file>.xpi

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const extensionRoot = path.resolve(scriptDirectory, "..");
const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  cwd: extensionRoot,
  encoding: "utf8"
}).trim();

function main() {
  if (!process.env.WEB_EXT_API_KEY || !process.env.WEB_EXT_API_SECRET) {
    fail(
      "WEB_EXT_API_KEY and WEB_EXT_API_SECRET must be set (AMO → Tools → Manage API Keys).\n" +
        "Keep them in ~/.secrets.zsh or .env.local, never in git."
    );
  }

  run("node", [path.join(scriptDirectory, "package-firefox.mjs")]);
  run("node", [path.join(scriptDirectory, "package-firefox-source.mjs")]);

  const version = JSON.parse(fs.readFileSync(path.join(extensionRoot, "package.json"), "utf8")).version;
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: extensionRoot, encoding: "utf8" }).trim();
  const sourceZip = path.join(
    repoRoot,
    "dist",
    "firefox",
    `cold-start-firefox-source-${version}-${commit.slice(0, 12)}.zip`
  );
  if (!fs.existsSync(sourceZip)) {
    fail(`Expected source package at ${sourceZip}`);
  }

  run("npx", [
    "--yes",
    "web-ext@10.5.0",
    "sign",
    "--source-dir",
    "dist-firefox",
    "--channel",
    "unlisted",
    "--artifacts-dir",
    "web-ext-artifacts",
    "--upload-source-code",
    sourceZip,
    "--no-input"
  ]);

  process.stdout.write("\nSigned XPI written to apps/extension/web-ext-artifacts/.\n");
  process.stdout.write(`Publish it: npm run release:firefox -- apps/extension/web-ext-artifacts/cold_start_alpha-${version}.xpi\n`);
}

function run(command, args) {
  execFileSync(command, args, { cwd: extensionRoot, env: process.env, stdio: "inherit" });
}

function fail(message) {
  process.stderr.write(`Firefox signing failed: ${message}\n`);
  process.exit(1);
}

main();
