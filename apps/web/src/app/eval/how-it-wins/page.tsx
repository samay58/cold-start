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
  // Count filed reads that carry a verdict, not raw events: a changed mind is a second event
  // for the same slug, and a verdict for a slug this run did not produce is not progress.
  const judgedSlugs = new Set(
    events.filter((event) => event.kind === "how-it-wins").map((event) => event.slug)
  );
  const judged = reads.filter((entry) => judgedSlugs.has(entry.slug)).length;

  return (
    <main className="eval-hiw-page">
      <div className="eval-hiw-progress" aria-hidden="true">
        <span style={{ width: `${(judged / reads.length) * 100}%` }} />
      </div>
      <p className="eval-progress">
        Read {judged + 1} of {reads.length}
      </p>
      <h1 className="eval-question">
        {file.name} <span className="eval-table-slug">{file.domain}</span>
      </h1>
      <p className="eval-hiw-brief">
        Two blind reads of the same company. Pick the better one, rate each, then the writers are
        revealed. The bar at the bottom follows you down the page.
      </p>
      <div className="eval-grid eval-hiw-grid">
        {(["A", "B"] as const).map((label) => {
          const arm = file.arms[label];
          return (
            <section key={label} className="eval-hiw-arm">
              <p className="eval-pair-label">{label}</p>
              {/* The error text itself stays behind the verdict: provider error bodies can
                  echo the model id, which would unblind the column. */}
              {arm.failure ? (
                <p className="eval-hiw-empty">This read did not come back.</p>
              ) : (
                <HowItWinsView read={arm.read} />
              )}
            </section>
          );
        })}
      </div>
      {/* Keyed by slug: a stale verdict must never survive into the next card. */}
      <HowItWinsReview
        key={slug}
        slug={slug}
        name={file.name}
        position={judged + 1}
        total={reads.length}
      />
    </main>
  );
}
