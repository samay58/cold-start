// Fails when a source file crosses the line limit. The allowlist is a ratchet: it names the files
// that were already over the limit on September 15 2026 and only loses entries, once a file is split.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

export const FILE_SIZE_LIMIT = 1000;

export const FILE_SIZE_ALLOWLIST: ReadonlySet<string> = new Set([
  "apps/extension/src/research/ResearchLayerPanel.tsx",
  "apps/extension/src/sidepanel.tsx",
  "apps/web/src/inngest/functions.ts",
  "packages/pipeline/src/generate-card.ts"
]);

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mjs"]);
const SKIPPED_DIRECTORIES = new Set(["node_modules", "dist", "dist-firefox", ".next"]);

export type FileSizeReport = {
  oversized: { path: string; lines: number }[];
  staleAllowlist: string[];
};

function sourceRoots(repoRoot: string): string[] {
  const roots = ["scripts"];
  for (const group of ["apps", "packages"]) {
    if (!exists(join(repoRoot, group))) continue;
    for (const entry of readdirSync(join(repoRoot, group), { withFileTypes: true })) {
      if (entry.isDirectory()) roots.push(join(group, entry.name, "src"));
    }
  }
  return roots.filter(root => exists(join(repoRoot, root)));
}

export function lineCount(contents: string): number {
  let count = 0;
  for (const char of contents) if (char === "\n") count += 1;
  return count;
}

export function fileSizeReport(repoRoot: string, options?: { limit?: number; allowlist?: ReadonlySet<string>; roots?: string[] }): FileSizeReport {
  const limit = options?.limit ?? FILE_SIZE_LIMIT;
  const allowlist = options?.allowlist ?? FILE_SIZE_ALLOWLIST;
  const roots = options?.roots ?? sourceRoots(repoRoot);
  const oversized: FileSizeReport["oversized"] = [];
  const seen = new Set<string>();
  for (const root of roots) {
    for (const file of walk(join(repoRoot, root))) {
      const path = relative(repoRoot, file).split(sep).join("/");
      seen.add(path);
      const lines = lineCount(readFileSync(file, "utf8"));
      if (lines > limit && !allowlist.has(path)) oversized.push({ path, lines });
    }
  }
  const staleAllowlist = [...allowlist].filter(path => {
    if (!seen.has(path)) return true;
    return lineCount(readFileSync(join(repoRoot, path), "utf8")) <= limit;
  });
  oversized.sort((a, b) => b.lines - a.lines);
  return { oversized, staleAllowlist: staleAllowlist.sort() };
}

function* walk(directory: string): Generator<string> {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) yield* walk(path);
      continue;
    }
    if (!entry.isFile()) continue;
    const extension = entry.name.slice(entry.name.lastIndexOf("."));
    if (!SOURCE_EXTENSIONS.has(extension) || /\.test\.[cm]?[jt]sx?$/.test(entry.name)) continue;
    yield path;
  }
}

function exists(path: string) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function main() {
  const report = fileSizeReport(process.cwd());
  for (const file of report.oversized) {
    console.error(`${file.path}: ${file.lines} lines, limit ${FILE_SIZE_LIMIT}. Split it; a module changes for one reason.`);
  }
  for (const path of report.staleAllowlist) {
    console.error(`${path}: allowlisted in scripts/check-file-size.ts but now under the limit or gone. Remove the entry.`);
  }
  if (report.oversized.length > 0 || report.staleAllowlist.length > 0) process.exit(1);
  console.log(`check:file-size: no source file over ${FILE_SIZE_LIMIT} lines outside the ${FILE_SIZE_ALLOWLIST.size}-entry allowlist.`);
}

if (process.argv[1] && /check-file-size\.ts$/.test(process.argv[1])) main();
