import Link from "next/link";
import { assertEvalRigEnabled } from "../gate";
import { HowItWinsView } from "../HowItWinsView";
import { nextHowItWinsSlug, readHowItWinsReads, readLedger } from "../rig-data";
import { HowItWinsReview } from "./HowItWinsReview";
import {
  HOW_IT_WINS_RATING_LABEL,
  HOW_IT_WINS_RATINGS,
  type HowItWinsFile,
  type HowItWinsRating,
  type LedgerEvent
} from "../types";

export const dynamic = "force-dynamic";

type Standing = { model: string; picks: number; ratings: Record<HowItWinsRating, number> };

function standings(reads: HowItWinsFile[], events: LedgerEvent[]): Standing[] {
  const byModel = new Map<string, Standing>();
  const at = (model: string) => {
    const existing = byModel.get(model);
    if (existing) return existing;
    const created: Standing = { model, picks: 0, ratings: { ship: 0, weak: 0, slop: 0 } };
    byModel.set(model, created);
    return created;
  };
  const keyed = new Map(reads.map((entry) => [entry.slug, entry.key]));
  // Append-only ledger: the latest verdict for a slug is the one that counts.
  const latest = new Map<string, Extract<LedgerEvent, { kind: "how-it-wins" }>>();
  for (const event of events) {
    if (event.kind === "how-it-wins") latest.set(event.slug, event);
  }
  for (const event of latest.values()) {
    const key = keyed.get(event.slug);
    if (!key) continue;
    if (event.pick !== "neither") at(key[event.pick]).picks += 1;
    at(key.A).ratings[event.ratings.A] += 1;
    at(key.B).ratings[event.ratings.B] += 1;
  }
  return [...byModel.values()].sort((a, b) => b.picks - a.picks || a.model.localeCompare(b.model));
}

export default async function HowItWinsPage() {
  assertEvalRigEnabled();
  const [reads, events] = await Promise.all([readHowItWinsReads(), readLedger()]);

  if (reads.length === 0) {
    return (
      <main>
        <h1 className="eval-question">No reads filed</h1>
        <p className="eval-progress">Run npm run eval:how-it-wins to write them.</p>
      </main>
    );
  }

  const slug = nextHowItWinsSlug(reads, events);
  if (!slug) {
    const table = standings(reads, events);
    return (
      <main>
        <h1 className="eval-question">All {reads.length} read</h1>
        <table className="eval-table">
          <thead>
            <tr>
              <th>Writer</th>
              <th>Picks</th>
              {HOW_IT_WINS_RATINGS.map((rating) => (
                <th key={rating}>{HOW_IT_WINS_RATING_LABEL[rating]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.map((row) => (
              <tr key={row.model}>
                <td>{row.model}</td>
                <td>{row.picks}</td>
                {HOW_IT_WINS_RATINGS.map((rating) => (
                  <td key={rating}>{row.ratings[rating]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="eval-done-links">
          <Link href="/eval/standings">standings</Link>
        </p>
      </main>
    );
  }

  const file = reads.find((entry) => entry.slug === slug);
  if (!file) throw new Error(`no filed read for ${slug}`);
  const judged = events.filter((event) => event.kind === "how-it-wins").length;

  return (
    <main>
      <p className="eval-progress">
        Read {judged + 1} of {reads.length}
      </p>
      <h1 className="eval-question">
        {file.name} <span className="eval-table-slug">{file.domain}</span>
      </h1>
      <div className="eval-grid">
        {(["A", "B"] as const).map((label) => (
          <section key={label} className="eval-hiw-arm">
            <p className="eval-pair-label">{label}</p>
            <HowItWinsView read={file.arms[label].read} />
          </section>
        ))}
      </div>
      {/* Keyed by slug: a stale verdict must never survive into the next card. */}
      <HowItWinsReview key={slug} slug={slug} />
    </main>
  );
}
