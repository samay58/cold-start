#!/usr/bin/env node

// Firefox release packager: builds dist-firefox with a fully pinned production
// environment, inspects the emitted manifest against the reviewed surface, scans
// for credentials, and writes a deterministic ZIP (same custom writer approach as
// package-chrome-web-store.mjs: fixed headers, no timestamps). --verify builds
// twice and asserts identical bytes; the CI reproducibility job runs the same
// build in two clean checkouts, so together they prove what AMO reviewers rebuild
// will match byte for byte.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const extensionRoot = path.resolve(scriptDirectory, "..");
const repoRoot = git(["rev-parse", "--show-toplevel"]).trim();
const distDirectory = path.join(extensionRoot, "dist-firefox");
const outputDirectory = path.join(repoRoot, "dist", "firefox");
const verifyOnly = parseArguments(process.argv.slice(2));

// The exact env the reviewer README documents. Every VITE_ var the extension
// reads is pinned so a developer machine's .env.local cannot leak into the
// artifact through Vite's import.meta.env inlining. sign-firefox.mjs re-runs
// this script rather than importing it, so the pinning lives in one place.
const RELEASE_BUILD_ENV = {
  VITE_COLD_START_API_ORIGIN: "https://cold-start-samay58s-projects.vercel.app",
  VITE_COLD_START_ALLOW_LOCAL_API_ORIGIN: "false",
  VITE_COLD_START_ALPHA_INVITE_ORIGIN: "https://cold-start.semitechie.vc"
};

const expectedPermissions = ["activeTab", "storage"];
const expectedHostPermissions = ["https://cold-start-samay58s-projects.vercel.app/*"];
const GECKO_ID = "cold-start@semitechie.vc";
const UPDATE_URL = "https://cold-start.semitechie.vc/firefox/updates.json";

const excludedPathPatterns = [
  { label: ".DS_Store", test: (relativePath) => path.posix.basename(relativePath) === ".DS_Store" },
  { label: "source map", test: (relativePath) => relativePath.endsWith(".map") },
  {
    label: "vite metadata",
    test: (relativePath) => relativePath === ".vite" || relativePath.startsWith(".vite/")
  },
  {
    label: "secret or environment file",
    test: (relativePath) =>
      pathSegments(relativePath).some(
        (segment) =>
          segment === "secrets" ||
          segment.startsWith("secret.") ||
          segment.startsWith("secrets.") ||
          segment === ".env" ||
          segment.startsWith(".env.") ||
          segment.endsWith(".pem") ||
          segment.endsWith(".key")
      )
  }
];

const credentialPatterns = [
  { label: "Anthropic API key", pattern: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  { label: "GitHub token", pattern: /(?:github_pat_|gh[pousr]_)[A-Za-z0-9_]{20,}/ },
  { label: "Google API key", pattern: /AIza[0-9A-Za-z_-]{35}/ },
  { label: "database credential", pattern: /postgres(?:ql)?:\/\/[^/\s:@]+:[^@\s]+@/ },
  { label: "private key", pattern: /-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/ },
  { label: "wallet private key", pattern: /\b0x[a-fA-F0-9]{64}\b/ },
  { label: "AMO JWT credential", pattern: /WEB_EXT_API_(?:KEY|SECRET)\s*=\s*[^\s"'`]{8,}/ },
  {
    label: "assigned service credential",
    pattern:
      /(?:ANTHROPIC_API_KEY|DATABASE_URL|DIRECT_[A-Z_]+_API_KEY|EXTENSION_API_TOKEN|GITHUB_TOKEN|INNGEST_(?:EVENT|SIGNING)_KEY|OPENROUTER_API_KEY|X402_PRIVATE_KEY)\s*=\s*[^\s"'`]{12,}/
  }
];
const textExtensions = new Set([".css", ".html", ".js", ".json", ".mjs", ".svg", ".txt"]);

function main() {
  requireCleanCommit();
  requireNoUnpinnedViteVars();

  const extensionPackage = readJson(path.join(extensionRoot, "package.json"));
  const version = extensionPackage.version;
  assert(/^\d+(?:\.\d+){1,3}$/.test(String(version)), `Unexpected extension version: ${String(version)}`);
  const commit = git(["rev-parse", "HEAD"]).trim();
  const shortCommit = commit.slice(0, 12);
  const artifactName = `cold-start-firefox-${version}-${shortCommit}.zip`;

  runBuild();
  const firstPackage = collectPackage(version);
  const firstZip = createZip(firstPackage.files);
  const firstChecksum = sha256(firstZip);

  if (verifyOnly) {
    runBuild();
    const secondPackage = collectPackage(version);
    const secondZip = createZip(secondPackage.files);
    assert(
      firstChecksum === sha256(secondZip) && firstZip.equals(secondZip),
      "Two clean production builds produced different ZIP bytes."
    );
    printInspection({
      artifactName,
      checksum: firstChecksum,
      commit,
      excluded: unique([...firstPackage.excluded, ...secondPackage.excluded]),
      fileCount: firstPackage.files.length,
      manifest: secondPackage.manifest,
      verifiedTwice: true
    });
    process.stdout.write("Verification mode did not write an artifact.\n");
    return;
  }

  fs.mkdirSync(outputDirectory, { recursive: true });
  const artifactPath = path.join(outputDirectory, artifactName);
  const checksumPath = `${artifactPath}.sha256`;
  fs.writeFileSync(artifactPath, firstZip);
  fs.writeFileSync(checksumPath, `${firstChecksum}  ${artifactName}\n`, "utf8");

  printInspection({
    artifactName,
    checksum: firstChecksum,
    commit,
    excluded: firstPackage.excluded,
    fileCount: firstPackage.files.length,
    manifest: firstPackage.manifest,
    verifiedTwice: false
  });
  process.stdout.write(`Artifact: ${artifactPath}\nChecksum: ${checksumPath}\n`);
  process.stdout.write("Sign it with: npm run sign:firefox -w @cold-start/extension\n");
}

function parseArguments(args) {
  const unknown = args.filter((argument) => argument !== "--verify");
  if (unknown.length > 0) {
    fail(`Unknown argument${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}`);
  }
  return args.includes("--verify");
}

function requireCleanCommit() {
  git(["rev-parse", "--verify", "HEAD^{commit}"]);
  const status = git(["status", "--porcelain=v1", "--untracked-files=all"]);
  assert(
    status.trim() === "",
    `Firefox packaging requires a clean checked commit. Dirty paths:\n${status.trim()}`
  );
}

// Vite inlines every VITE_-prefixed var from the repo-root .env.local into
// import.meta.env. The pinned RELEASE_BUILD_ENV overrides the known ones; an
// unknown extra var would silently make the local artifact diverge from the
// clean-checkout build a reviewer produces.
function requireNoUnpinnedViteVars() {
  const envPath = path.join(repoRoot, ".env.local");
  if (!fs.existsSync(envPath)) {
    return;
  }
  const names = fs
    .readFileSync(envPath, "utf8")
    .split("\n")
    .map((line) => line.match(/^(VITE_[A-Z0-9_]+)=/)?.[1])
    .filter(Boolean);
  const unpinned = names.filter((name) => !(name in RELEASE_BUILD_ENV));
  assert(
    unpinned.length === 0,
    `.env.local defines VITE_ vars the release build does not pin: ${unpinned.join(", ")}. Add them to RELEASE_BUILD_ENV in package-firefox.mjs.`
  );
}

function runBuild() {
  execFileSync("npm", ["run", "build:firefox"], {
    cwd: extensionRoot,
    env: { ...process.env, NODE_ENV: "production", ...RELEASE_BUILD_ENV },
    stdio: "inherit"
  });
}

function collectPackage(expectedVersion) {
  assert(fs.existsSync(distDirectory), "Production build did not create apps/extension/dist-firefox.");

  const allFiles = walkFiles(distDirectory);
  const excluded = [];
  const includedPaths = allFiles.filter((relativePath) => {
    const exclusion = excludedPathPatterns.find(({ test }) => test(relativePath));
    if (exclusion) {
      excluded.push(`${relativePath} (${exclusion.label})`);
      return false;
    }
    return true;
  });

  const manifestPath = path.join(distDirectory, "manifest.json");
  assert(includedPaths.includes("manifest.json"), "Production package is missing manifest.json.");
  const manifest = readJson(manifestPath);
  inspectManifest(manifest, expectedVersion, includedPaths);

  const files = includedPaths.map((relativePath) => {
    const absolutePath = path.join(distDirectory, ...relativePath.split("/"));
    const data = fs.readFileSync(absolutePath);
    inspectForCredentials(relativePath, data);
    return { data, name: relativePath };
  });

  assert(files.length > 0, "Production package is empty.");
  return { excluded, files, manifest };
}

function inspectManifest(manifest, expectedVersion, includedPaths) {
  assert(manifest.manifest_version === 3, "Firefox package must use Manifest V3.");
  assert(manifest.name === "Cold Start Alpha", `Unexpected manifest name: ${String(manifest.name)}`);
  assert(manifest.version === expectedVersion, `Manifest version ${manifest.version} does not match package ${expectedVersion}.`);
  assertSameMembers(manifest.permissions, expectedPermissions, "manifest permissions");
  assertSameMembers(manifest.host_permissions, expectedHostPermissions, "manifest host permissions");

  // Chrome-only surface must not leak into the Firefox build.
  assert(!("side_panel" in manifest), "Unexpected side_panel in Firefox manifest.");
  assert(!("externally_connectable" in manifest), "Unexpected externally_connectable in Firefox manifest.");
  assert(!("minimum_chrome_version" in manifest), "Unexpected minimum_chrome_version in Firefox manifest.");
  assert(!("optional_permissions" in manifest), "Unexpected optional_permissions in Firefox manifest.");
  assert(!("content_scripts" in manifest), "Unexpected content_scripts in Firefox manifest.");

  // Production keeps Mozilla's default extension-pages CSP; only local-API dev
  // builds override it. A CSP key here means local flags leaked into the build.
  assert(!("content_security_policy" in manifest), "Local-development CSP override found in production Firefox manifest.");

  assert(manifest.sidebar_action?.default_panel === "sidepanel.html", "Unexpected sidebar entry point.");
  assert(manifest.sidebar_action?.open_at_install === false, "Sidebar must not open at install.");
  assert(Array.isArray(manifest.background?.scripts) && manifest.background.scripts[0] === "service-worker-loader.js", "Unexpected background entry point.");
  assert(manifest.incognito === "not_allowed", "Firefox build must opt out of private browsing.");

  const gecko = manifest.browser_specific_settings?.gecko;
  assert(gecko?.id === GECKO_ID, `Unexpected gecko id: ${String(gecko?.id)}`);
  assert(gecko?.strict_min_version === "140.0", "Unexpected Firefox version floor.");
  assert(
    JSON.stringify(gecko?.data_collection_permissions?.required) === JSON.stringify(["browsingActivity"]),
    "Unexpected data collection declaration."
  );
  assert(gecko?.update_url === UPDATE_URL, `Unexpected update_url: ${String(gecko?.update_url)}`);

  for (const permission of manifest.host_permissions) {
    assert(permission.startsWith("https://"), `Production host permission must use HTTPS: ${permission}`);
    assert(!permission.includes("localhost") && !permission.includes("127.0.0.1"), `Local host permission found: ${permission}`);
    assert(permission !== "<all_urls>" && !permission.startsWith("*://"), `Wildcard host permission found: ${permission}`);
  }

  for (const [size, iconPath] of Object.entries(manifest.icons ?? {})) {
    assert(includedPaths.includes(iconPath), `Manifest icon ${size} is missing: ${iconPath}`);
  }
}

function assertSameMembers(actual, expected, label) {
  assert(Array.isArray(actual), `${label} must be an array.`);
  const actualSorted = [...actual].sort();
  const expectedSorted = [...expected].sort();
  assert(
    JSON.stringify(actualSorted) === JSON.stringify(expectedSorted),
    `Unexpected ${label}. Expected ${expectedSorted.join(", ")}; received ${actualSorted.join(", ")}.`
  );
}

function inspectForCredentials(relativePath, data) {
  if (!textExtensions.has(path.posix.extname(relativePath))) {
    return;
  }
  const text = data.toString("utf8");
  for (const credential of credentialPatterns) {
    assert(!credential.pattern.test(text), `Possible ${credential.label} found in ${relativePath}.`);
  }
}

function walkFiles(root) {
  const files = [];

  function visit(directory, prefix) {
    const entries = fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const entry of entries) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath, relativePath);
      } else if (entry.isFile()) {
        files.push(relativePath);
      } else {
        fail(`Unsupported filesystem entry in build output: ${relativePath}`);
      }
    }
  }

  visit(root, "");
  return files.sort((left, right) => Buffer.from(left).compare(Buffer.from(right)));
}

function createZip(files) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const compressed = deflateRawSync(file.data, { level: 9 });
    const checksum = crc32(file.data);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(33, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(file.data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, name, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(0x0314, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(33, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(file.data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0o100644 * 0x10000, 38);
    centralHeader.writeUInt32LE(localOffset, 42);
    centralParts.push(centralHeader, name);

    localOffset += localHeader.length + name.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let current = value;
  for (let bit = 0; bit < 8; bit += 1) {
    current = (current & 1) === 1 ? 0xedb88320 ^ (current >>> 1) : current >>> 1;
  }
  return current >>> 0;
});

function crc32(data) {
  let value = 0xffffffff;
  for (const byte of data) {
    value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function printInspection({ artifactName, checksum, commit, excluded, fileCount, manifest, verifiedTwice }) {
  process.stdout.write("\nFirefox package inspection\n");
  process.stdout.write(`Commit: ${commit}\n`);
  process.stdout.write(`Manifest: MV${manifest.manifest_version} ${manifest.name} ${manifest.version}\n`);
  process.stdout.write(`Gecko: ${manifest.browser_specific_settings.gecko.id} floor ${manifest.browser_specific_settings.gecko.strict_min_version}\n`);
  process.stdout.write(`Permissions: ${[...manifest.permissions].sort().join(", ")}\n`);
  process.stdout.write(`Host permissions: ${manifest.host_permissions.join(", ")}\n`);
  process.stdout.write(`Update url: ${manifest.browser_specific_settings.gecko.update_url}\n`);
  process.stdout.write(`Files: ${fileCount}\n`);
  process.stdout.write(`Excluded: ${excluded.length === 0 ? "none" : excluded.join(", ")}\n`);
  process.stdout.write(`Artifact name: ${artifactName}\n`);
  process.stdout.write(`SHA256: ${checksum}\n`);
  if (verifiedTwice) {
    process.stdout.write("Determinism: two production builds produced identical ZIP bytes\n");
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`Could not read JSON from ${path.relative(repoRoot, filePath)}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function pathSegments(relativePath) {
  return relativePath.split("/").map((segment) => segment.toLowerCase());
}

function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

function unique(values) {
  return [...new Set(values)].sort();
}

function git(args) {
  return execFileSync("git", args, { cwd: extensionRoot, encoding: "utf8" });
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function fail(message) {
  process.stderr.write(`Firefox package failed: ${message}\n`);
  process.exit(1);
}

main();
