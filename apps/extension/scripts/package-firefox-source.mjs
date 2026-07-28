#!/usr/bin/env node

// Reviewer source package: AMO requires matching human-readable source plus build
// instructions for every minified submission; reviewers rebuild and diff expecting
// zero differences. Built from `git archive HEAD` so it contains exactly the
// tracked files at the packaged commit: the extension workspace, the workspaces
// its build compiles (core, ui), the root npm manifests, and a package.json stub
// for every other workspace so `npm ci` can resolve the lockfile. No working-tree
// state, no environment files, no secrets.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const extensionRoot = path.resolve(scriptDirectory, "..");
const repoRoot = git(["rev-parse", "--show-toplevel"]).trim();
const outputDirectory = path.join(repoRoot, "dist", "firefox");

const SOURCE_PATHSPECS = [
  "package.json",
  "package-lock.json",
  "apps/extension",
  "packages/core",
  "packages/ui",
  // Stubs only: npm ci refuses to run when a workspace named in the lockfile is
  // missing from disk, so every workspace manifest rides along.
  "apps/*/package.json",
  "packages/*/package.json"
];

function main() {
  const status = git(["status", "--porcelain=v1", "--untracked-files=all"]);
  if (status.trim() !== "") {
    fail(`Source packaging requires a clean checked commit. Dirty paths:\n${status.trim()}`);
  }

  const readmePath = path.join(extensionRoot, "README-REVIEWERS.md");
  if (!fs.existsSync(readmePath)) {
    fail("apps/extension/README-REVIEWERS.md is missing; reviewers need the build instructions.");
  }

  const version = JSON.parse(fs.readFileSync(path.join(extensionRoot, "package.json"), "utf8")).version;
  const commit = git(["rev-parse", "HEAD"]).trim();
  const artifactName = `cold-start-firefox-source-${version}-${commit.slice(0, 12)}.zip`;
  fs.mkdirSync(outputDirectory, { recursive: true });
  const artifactPath = path.join(outputDirectory, artifactName);

  execFileSync(
    "git",
    ["archive", "--format=zip", "-9", `--output=${artifactPath}`, "HEAD", ...SOURCE_PATHSPECS],
    { cwd: repoRoot, stdio: "inherit" }
  );

  process.stdout.write(`Source package: ${artifactPath}\n`);
  process.stdout.write("Build instructions live at apps/extension/README-REVIEWERS.md inside the archive;\n");
  process.stdout.write("point reviewers there in the submission notes. web-ext sign --upload-source-code attaches the zip.\n");
}

function git(args) {
  return execFileSync("git", args, { cwd: extensionRoot, encoding: "utf8" });
}

function fail(message) {
  process.stderr.write(`Source package failed: ${message}\n`);
  process.exit(1);
}

main();
