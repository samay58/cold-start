import { readFile } from "node:fs/promises";
import path from "node:path";
import { dataDir } from "./gate";
import {
  corpusIndexRowSchema,
  sessionPlanSchema,
  type CorpusIndexRow,
  type LedgerEvent,
  type SessionPlan
} from "./types";

const SLUG_PATTERN = /^[a-z0-9-]+$/;

export async function readCorpusIndex(): Promise<CorpusIndexRow[]> {
  const raw = await readFile(path.join(dataDir(), "corpus", "index.json"), "utf8");
  return corpusIndexRowSchema.array().parse(JSON.parse(raw));
}

export async function readCardFile(
  slug: string
): Promise<{ card: unknown; sections: unknown[]; index: CorpusIndexRow }> {
  if (!SLUG_PATTERN.test(slug)) {
    throw new Error(`invalid slug: ${slug}`);
  }
  const raw = await readFile(path.join(dataDir(), "corpus", "cards", `${slug}.json`), "utf8");
  const parsed = JSON.parse(raw) as { card: unknown; sections: unknown[]; index: unknown };
  return {
    card: parsed.card,
    sections: Array.isArray(parsed.sections) ? parsed.sections : [],
    index: corpusIndexRowSchema.parse(parsed.index)
  };
}

export async function readSessionPlan(): Promise<SessionPlan> {
  const raw = await readFile(path.join(dataDir(), "session-plan.json"), "utf8");
  return sessionPlanSchema.parse(JSON.parse(raw));
}

export async function readLedger(): Promise<LedgerEvent[]> {
  let raw: string;
  try {
    raw = await readFile(path.join(dataDir(), "ledger", "picks.jsonl"), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const events: LedgerEvent[] = [];
  const lines = raw.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      events.push(JSON.parse(line) as LedgerEvent);
    } catch {
      // A corrupt ledger should stop a sitting, not silently drop judgments.
      throw new Error(`ledger line ${i + 1} is corrupt`);
    }
  }
  return events;
}

export async function readFinalists(): Promise<string[]> {
  let raw: string;
  try {
    raw = await readFile(path.join(dataDir(), "finalists.json"), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const parsed = JSON.parse(raw) as { slugs?: unknown };
  return Array.isArray(parsed.slugs) ? parsed.slugs.filter((s): s is string => typeof s === "string") : [];
}

export function nextQuickPickRound(
  plan: SessionPlan,
  events: LedgerEvent[]
): SessionPlan["rounds"][number] | null {
  const answered = new Set(
    events.filter((event) => event.kind === "quick-pick").map((event) => event.roundIndex)
  );
  return plan.rounds.find((round) => !answered.has(round.index)) ?? null;
}

export function nextDeepSlug(finalists: string[], events: LedgerEvent[]): string | null {
  const judged = new Set(
    events.filter((event) => event.kind === "deep-single").map((event) => event.slug)
  );
  return finalists.find((slug) => !judged.has(slug)) ?? null;
}
