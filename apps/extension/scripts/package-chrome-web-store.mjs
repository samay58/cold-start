#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const extensionRoot = path.resolve(scriptDirectory, "..");
const repoRoot = git(["rev-parse", "--show-toplevel"]).trim();
const distDirectory = path.join(extensionRoot, "dist");
const releaseRecordPath = path.join(
  repoRoot,
  "docs",
  "product",
  "chrome-web-store-alpha",
  "release-version.json"
);
const outputDirectory = path.join(repoRoot, "dist", "chrome-web-store");
const verifyOnly = parseArguments(process.argv.slice(2));

const expectedPermissions = ["activeTab", "sidePanel", "storage"];
const expectedHostPermissions = ["https://cold-start-samay58s-projects.vercel.app/*"];
const expectedExternalMatches = ["https://cold-start.semitechie.vc/*"];
const excludedPathPatterns = [
  { label: ".DS_Store", test: (relativePath) => path.posix.basename(relativePath) === ".DS_Store" },
  { label: "source map", test: (relativePath) => relativePath.endsWith(".map") },
  {
    label: "local settings",
    test: (relativePath) =>
      pathSegments(relativePath).some(
        (segment) => segment === "settings" || segment.startsWith("settings.") || segment.endsWith(".local")
      )
  },
  {
    label: "fixture",
    test: (relativePath) =>
      pathSegments(relativePath).some(
        (segment) =>
          segment === "fixture" ||
          segment === "fixtures" ||
          segment.startsWith("fixture.") ||
          segment.startsWith("fixtures.")
      )
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
  {
    label: "assigned service credential",
    pattern:
      /(?:ANTHROPIC_API_KEY|DATABASE_URL|DIRECT_[A-Z_]+_API_KEY|EXTENSION_API_TOKEN|GITHUB_TOKEN|INNGEST_(?:EVENT|SIGNING)_KEY|OPENROUTER_API_KEY|X402_PRIVATE_KEY)\s*=\s*[^\s"'`]{12,}/
  }
];
const textExtensions = new Set([".css", ".html", ".js", ".json", ".mjs", ".svg", ".txt"]);

function main() {
  requireCleanCommit();

  const extensionPackage = readJson(path.join(extensionRoot, "package.json"));
  const releaseRecord = readJson(releaseRecordPath);
  const version = requireVersionIncrease(extensionPackage.version, releaseRecord.lastAcceptedVersion);
  const commit = git(["rev-parse", "HEAD"]).trim();
  const shortCommit = commit.slice(0, 12);
  const artifactName = `cold-start-chrome-${version}-${shortCommit}.zip`;

  runBuild();
  const firstPackage = collectPackage(version);
  const firstZip = createZip(firstPackage.files);
  const firstChecksum = sha256(firstZip);

  if (verifyOnly) {
    runBuild();
    const secondPackage = collectPackage(version);
    const secondZip = createZip(secondPackage.files);
    const secondChecksum = sha256(secondZip);
    assert(
      firstChecksum === secondChecksum && firstZip.equals(secondZip),
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
    process.stdout.write(
      `Verification mode did not write an artifact or change ${path.relative(repoRoot, releaseRecordPath)}.\n`
    );
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
  process.stdout.write(
    `Release baseline unchanged. Advance ${path.relative(repoRoot, releaseRecordPath)} only after Web Store acceptance.\n`
  );
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
    `Chrome packaging requires a clean checked commit. Dirty paths:\n${status.trim()}`
  );
}

function requireVersionIncrease(version, baseline) {
  const currentParts = chromeVersionParts(version, "extension package version");
  const baselineParts = chromeVersionParts(baseline, "last accepted Web Store version");
  assert(compareVersionParts(currentParts, baselineParts) > 0, `${version} must be greater than ${baseline}.`);
  return version;
}

function chromeVersionParts(value, label) {
  assert(typeof value === "string", `${label} must be a string.`);
  assert(/^\d+(?:\.\d+){0,3}$/.test(value), `${label} must use Chrome's one-to-four-part numeric format.`);
  const parts = value.split(".").map(Number);
  assert(parts.every((part) => Number.isSafeInteger(part) && part >= 0 && part <= 65_535), `${label} has an invalid part.`);
  return [...parts, ...Array(4 - parts.length).fill(0)];
}

function compareVersionParts(left, right) {
  for (let index = 0; index < 4; index += 1) {
    if (left[index] !== right[index]) {
      return left[index] - right[index];
    }
  }
  return 0;
}

function runBuild() {
  execFileSync("npm", ["run", "build"], {
    cwd: extensionRoot,
    env: { ...process.env, NODE_ENV: "production" },
    stdio: "inherit"
  });
}

function collectPackage(expectedVersion) {
  assert(fs.existsSync(distDirectory), "Production build did not create apps/extension/dist.");

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
  assert(manifest.manifest_version === 3, "Web Store package must use Manifest V3.");
  assert(manifest.name === "Cold Start Alpha", `Unexpected manifest name: ${String(manifest.name)}`);
  assert(manifest.version === expectedVersion, `Manifest version ${manifest.version} does not match package ${expectedVersion}.`);
  assertSameMembers(manifest.permissions, expectedPermissions, "manifest permissions");
  assertSameMembers(manifest.host_permissions, expectedHostPermissions, "manifest host permissions");
  assert(!("optional_permissions" in manifest), "Unexpected optional_permissions in production manifest.");
  assert(!("optional_host_permissions" in manifest), "Unexpected optional_host_permissions in production manifest.");
  assert(!("content_scripts" in manifest), "Unexpected content_scripts in production manifest.");
  assertSameMembers(
    manifest.externally_connectable?.matches,
    expectedExternalMatches,
    "externally connectable matches"
  );
  assert(manifest.minimum_chrome_version === "116", "Unexpected Chrome minimum version.");
  assert(manifest.side_panel?.default_path === "sidepanel.html", "Unexpected side panel entry point.");
  assert(manifest.background?.service_worker === "service-worker-loader.js", "Unexpected service worker entry point.");
  assert(manifest.background?.type === "module", "Production service worker must be a module.");

  for (const permission of manifest.host_permissions) {
    assert(permission.startsWith("https://"), `Production host permission must use HTTPS: ${permission}`);
    assert(!permission.includes("localhost") && !permission.includes("127.0.0.1"), `Local host permission found: ${permission}`);
    assert(permission !== "<all_urls>" && !permission.startsWith("*://"), `Wildcard host permission found: ${permission}`);
  }

  for (const [size, iconPath] of Object.entries(manifest.icons ?? {})) {
    assert(includedPaths.includes(iconPath), `Manifest icon ${size} is missing: ${iconPath}`);
  }
  assert(manifest.icons?.["128"] === "icons/icon-128.png", "Web Store package must include the 128px store icon.");
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
  process.stdout.write("\nChrome Web Store package inspection\n");
  process.stdout.write(`Commit: ${commit}\n`);
  process.stdout.write(`Manifest: MV${manifest.manifest_version} ${manifest.name} ${manifest.version}\n`);
  process.stdout.write(`Permissions: ${[...manifest.permissions].sort().join(", ")}\n`);
  process.stdout.write(`Host permissions: ${manifest.host_permissions.join(", ")}\n`);
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
  process.stderr.write(`Chrome package failed: ${message}\n`);
  process.exit(1);
}

main();
