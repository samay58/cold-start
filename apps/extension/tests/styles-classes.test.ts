import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Keeps styles.css and the components honest with each other. The first-90 merge shipped
// 330 lines of retired rule families (cs-source-pass-*, cs-live-*, cs-research-activity)
// because nothing failed when a selector lost its last consumer.

const SRC_DIR = join(__dirname, "..", "src");

// Class-shaped strings that are not stylesheet classes, or that inherit all styling from a
// parent selector on purpose. Every entry needs a reason.
const NOT_STYLESHEET_CLASSES = new Set([
  // Element id for the shared tooltip (aria-describedby target), not a class.
  "cs-company-shared-tooltip",
  // SVG child of .cs-eye-loader; the blink keyframes address it through the parent.
  "cs-eye-lid",
  // Animation hook inside .cs-motion-text; the fade is driven by framer-motion inline styles.
  "cs-motion-text-fade",
  // Flex child of .cs-signal-meta; it inherits the metadata type treatment from the parent.
  "cs-signal-source"
]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(full);
    }
    return /\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts") ? [full] : [];
  });
}

function classesUsedInSource(): Set<string> {
  const used = new Set<string>();
  for (const file of sourceFiles(SRC_DIR)) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/["'`]([^"'`\n]*)["'`]/g)) {
      for (const token of (match[1] ?? "").split(/\s+/)) {
        if (/^cs-[a-z0-9-]+$/.test(token)) {
          used.add(token);
        }
      }
    }
  }
  return used;
}

function classesDefinedInStylesheet(): Set<string> {
  const css = readFileSync(join(SRC_DIR, "styles.css"), "utf8");
  return new Set(Array.from(css.matchAll(/\.(cs-[a-z0-9-]+)/g), (match) => match[1] ?? ""));
}

describe("extension class usage stays in sync with styles.css", () => {
  const used = classesUsedInSource();
  const defined = classesDefinedInStylesheet();

  it("every cs- class rule in styles.css has a component consumer", () => {
    const orphanRules = Array.from(defined).filter((cls) => !used.has(cls)).sort();
    expect(orphanRules).toEqual([]);
  });

  it("every cs- class a component renders has a stylesheet rule", () => {
    const unstyled = Array.from(used)
      .filter((cls) => !defined.has(cls) && !NOT_STYLESHEET_CLASSES.has(cls))
      .sort();
    expect(unstyled).toEqual([]);
  });
});
