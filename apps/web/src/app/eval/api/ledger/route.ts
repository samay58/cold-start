import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { dataDir } from "../../gate";
import { readCorpusIndex, readHowItWinsReads } from "../../rig-data";
import { ledgerEventInputSchema } from "../../types";

function involvedSlugs(event: { kind: string; group?: string[]; slug?: string }): string[] {
  return event.kind === "quick-pick" ? (event.group ?? []) : event.slug ? [event.slug] : [];
}

export async function POST(request: Request): Promise<Response> {
  // Return a plain 404 rather than notFound(); route handlers render no not-found boundary.
  if (process.env.EVAL_RIG_ENABLED !== "true") {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = ledgerEventInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.message }, { status: 400 });
  }

  const event = { ...parsed.data, ts: new Date().toISOString() };
  const ledgerDir = path.join(dataDir(), "ledger");
  await mkdir(ledgerDir, { recursive: true });
  // Append-only: a changed mind is a new event; nothing ever edits or truncates the file.
  await appendFile(path.join(ledgerDir, "picks.jsonl"), `${JSON.stringify(event)}\n`);

  const slugs = new Set(involvedSlugs(parsed.data));
  const index = await readCorpusIndex();
  const reveal = index.filter((row) => slugs.has(row.slug));
  // The blind read only learns which writer wrote which arm once the verdict is on disk.
  const judgedSlug = parsed.data.kind === "how-it-wins" ? parsed.data.slug : null;
  const key = judgedSlug
    ? (await readHowItWinsReads()).find((entry) => entry.slug === judgedSlug)?.key
    : undefined;
  return Response.json({ ok: true, reveal, ...(key ? { key } : {}) });
}
