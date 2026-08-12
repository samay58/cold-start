import { readFile } from "node:fs/promises";
import path from "node:path";
import { assertEvalRigEnabled, dataDir } from "../gate";
import { readCorpusIndex, readLedger } from "../rig-data";
import { poolEntrySchema, type CorpusIndexRow, type LedgerEvent } from "../types";

export const dynamic = "force-dynamic";

async function readPoolEntries() {
  try {
    const raw = await readFile(path.join(dataDir(), "pool.json"), "utf8");
    const parsed = JSON.parse(raw) as { entries?: unknown };
    return poolEntrySchema.array().parse(Array.isArray(parsed.entries) ? parsed.entries : []);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

type Standing = {
  slug: string;
  name: string;
  wins: number;
  runnerUps: number;
  eraBucket: string;
  richnessBand: string;
};

function standingsFrom(events: LedgerEvent[], index: Map<string, CorpusIndexRow>): Standing[] {
  const wins = new Map<string, number>();
  const runnerUps = new Map<string, number>();
  for (const event of events) {
    if (event.kind !== "quick-pick") continue;
    wins.set(event.winner, (wins.get(event.winner) ?? 0) + 1);
    if (event.runnerUp) runnerUps.set(event.runnerUp, (runnerUps.get(event.runnerUp) ?? 0) + 1);
  }
  const slugs = new Set([...wins.keys(), ...runnerUps.keys()]);
  return [...slugs]
    .map((slug) => {
      const row = index.get(slug);
      return {
        slug,
        name: row?.name ?? slug,
        wins: wins.get(slug) ?? 0,
        runnerUps: runnerUps.get(slug) ?? 0,
        eraBucket: row?.eraBucket ?? "unknown",
        richnessBand: row?.richnessBand ?? "unknown"
      };
    })
    .sort((a, b) => b.wins - a.wins || b.runnerUps - a.runnerUps || a.slug.localeCompare(b.slug));
}

function chipHistogram(events: LedgerEvent[]): { chip: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const event of events) {
    for (const chip of event.chips ?? []) {
      counts.set(chip, (counts.get(chip) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([chip, count]) => ({ chip, count }))
    .sort((a, b) => b.count - a.count || a.chip.localeCompare(b.chip));
}

function tierList(events: LedgerEvent[]): Record<"S" | "A" | "B", string[]> {
  // Append-only ledger: the latest deep-single for a slug is the standing verdict.
  const latest = new Map<string, "S" | "A" | "B">();
  for (const event of events) {
    if (event.kind === "deep-single") latest.set(event.slug, event.tier);
  }
  const grouped: Record<"S" | "A" | "B", string[]> = { S: [], A: [], B: [] };
  for (const [slug, tier] of latest) grouped[tier].push(slug);
  for (const tier of ["S", "A", "B"] as const) grouped[tier].sort();
  return grouped;
}

export default async function StandingsPage() {
  assertEvalRigEnabled();
  const [events, pool] = await Promise.all([readLedger(), readPoolEntries()]);
  const index = new Map((await readCorpusIndex()).map((row) => [row.slug, row]));

  const standings = standingsFrom(events, index);
  const chips = chipHistogram(events);
  const tiers = tierList(events);
  const rankedBySlug = new Map(standings.map((s) => [s.slug, s]));
  const controlAlarms = pool.filter((entry) => {
    if (!entry.control) return false;
    const standing = rankedBySlug.get(entry.slug);
    return Boolean(standing && (standing.wins > 0 || standing.runnerUps > 0));
  });
  const countsByKind = events.reduce<Record<string, number>>((acc, event) => {
    acc[event.kind] = (acc[event.kind] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <main className="eval-standings">
      <h1 className="eval-question">Standings</h1>

      {controlAlarms.length > 0 ? (
        <section className="eval-alarm">
          <h2>Control card ranked</h2>
          <p>
            The triage pool may be filtering wrong; consider widening.{" "}
            {controlAlarms
              .map((entry) => {
                const standing = rankedBySlug.get(entry.slug);
                return `${entry.slug} (wins: ${standing?.wins ?? 0}, runner-ups: ${standing?.runnerUps ?? 0})`;
              })
              .join("; ")}
          </p>
        </section>
      ) : null}

      <section>
        <h2>Quick-pick wins</h2>
        {standings.length === 0 ? (
          <p className="eval-progress">No quick-pick events yet.</p>
        ) : (
          <table className="eval-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Wins</th>
                <th>Runner-up</th>
                <th>Era</th>
                <th>Band</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((standing) => (
                <tr key={standing.slug}>
                  <td>
                    {standing.name} <span className="eval-table-slug">{standing.slug}</span>
                  </td>
                  <td>{standing.wins}</td>
                  <td>{standing.runnerUps}</td>
                  <td>{standing.eraBucket}</td>
                  <td>{standing.richnessBand}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>Chips</h2>
        {chips.length === 0 ? (
          <p className="eval-progress">No chips logged yet.</p>
        ) : (
          <ul className="eval-chip-histogram">
            {chips.map(({ chip, count }) => (
              <li key={chip}>
                {chip}: {count}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>Deep-single tiers</h2>
        {(["S", "A", "B"] as const).map((tier) => (
          <p key={tier} className="eval-tier-row">
            <span className="eval-tier-label">{tier}</span>
            {tiers[tier].length === 0 ? "none yet" : tiers[tier].join(", ")}
          </p>
        ))}
      </section>

      <section>
        <h2>Events</h2>
        <pre className="eval-event-counts">{JSON.stringify(countsByKind, null, 2)}</pre>
      </section>
    </main>
  );
}
