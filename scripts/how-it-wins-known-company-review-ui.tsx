import { createRoot } from "react-dom/client";
import {
  howItWinsStrategyById,
  stripCitationMarkers,
  type HowItWins,
  type HowItWinsStrategyId
} from "@cold-start/core";
import { HowItWinsEdge } from "../apps/extension/src/research/HowItWinsEdge";
import type { HowItWinsDisplay } from "../apps/extension/src/research/investor-lens";
import type { KnownCompanyReview } from "./how-it-wins-known-company-review";

declare global {
  interface Window {
    __KNOWN_COMPANY_REVIEWS__?: KnownCompanyReview[];
  }
}

function entries(list: Array<{ strategy: HowItWinsStrategyId; note: string }>) {
  return list.map((entry) => ({
    id: entry.strategy,
    name: howItWinsStrategyById(entry.strategy).name,
    meaning: howItWinsStrategyById(entry.strategy).meaning,
    note: stripCitationMarkers(entry.note)
  }));
}

function displayFromRead(read: HowItWins): HowItWinsDisplay {
  if (read.status === "thin_file") {
    return { state: "thin_file", sentence: null, running: [], pair: null, next: [], inQuestion: [], count: 0 };
  }
  if (read.status === "nothing_stands_out") {
    return {
      state: "nothing_stands_out",
      sentence: read.sentence ? stripCitationMarkers(read.sentence) : null,
      running: [],
      pair: null,
      next: [],
      inQuestion: entries(read.inQuestion ?? []),
      count: 0
    };
  }
  const [pairLeft, pairRight] = read.pair?.strategies ?? [];
  return {
    state: "read",
    sentence: stripCitationMarkers(read.sentence),
    running: entries(read.running),
    pair: read.pair && pairLeft && pairRight
      ? {
        strategies: [pairLeft, pairRight],
        names: [howItWinsStrategyById(pairLeft).name, howItWinsStrategyById(pairRight).name],
        meanings: [howItWinsStrategyById(pairLeft).meaning, howItWinsStrategyById(pairRight).meaning],
        note: stripCitationMarkers(read.pair.note),
        wrongIf: stripCitationMarkers(read.pair.wrongIf)
      }
      : null,
    next: entries(read.next),
    inQuestion: entries(read.inQuestion ?? []),
    count: read.running.length
  };
}

function NoteList({
  title,
  items
}: {
  title: string;
  items: Array<{ strategy: HowItWinsStrategyId; note: string }>;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="name">{title}</p>
      {items.map((entry) => (
        <div key={entry.strategy}>
          <p className="name">{howItWinsStrategyById(entry.strategy).name}</p>
          <p className="meaning">{howItWinsStrategyById(entry.strategy).meaning}</p>
          <p>{entry.note}</p>
        </div>
      ))}
    </div>
  );
}

function ReadText({ read }: { read: HowItWins }) {
  if (read.status === "thin_file") return <p>Not enough filed.</p>;
  if (read.status === "nothing_stands_out") {
    return (
      <div className="review-text">
        <p>{read.sentence ?? "Nothing stands out yet."}</p>
        <NoteList title="In question" items={read.inQuestion ?? []} />
      </div>
    );
  }
  return (
    <div className="review-text">
      <p>{read.sentence}</p>
      <NoteList title="What currently wins" items={read.running} />
      {read.pair ? (
        <div>
          <p className="name">The pair</p>
          <p>
            {howItWinsStrategyById(read.pair.strategies[0]).name} and{" "}
            {howItWinsStrategyById(read.pair.strategies[1]).name}
          </p>
          <p>{read.pair.note}</p>
          <p>Wrong if {read.pair.wrongIf}</p>
        </div>
      ) : null}
      <NoteList title="Not yet" items={read.next} />
      <NoteList title="In question" items={read.inQuestion ?? []} />
      <p>Wrong if {read.wrongIf}</p>
    </div>
  );
}

function kickerFor(review: KnownCompanyReview) {
  if (review.currentStrategyIds.length < 2) {
    return "The judge kept one live strategy, so this crown does not claim a current set. Hover the solid muted marks: those are the live uncertainties.";
  }
  if (review.dropReason === "running-dropped" && review.read.status === "read") {
    return `The judge kept ${review.currentStrategyIds.length} current; ${review.read.running.length} survived the citation check. Hover the solid muted marks for the live uncertainties.`;
  }
  if (review.dropReason === "running-dropped") {
    return `The judge kept ${review.currentStrategyIds.length} current; fewer than two survived the citation check, so this crown does not claim a current set.`;
  }
  return "Hover the marks. Solid muted outline is in question. Dashed is not yet. Ink cut is current.";
}

function App({ reviews }: { reviews: KnownCompanyReview[] }) {
  const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return (
    <main className="review">
      <p className="review-kicker">Known companies. Not the holdout. Production stays off.</p>
      <h1>How it wins, rewritten</h1>
      <p className="review-intro">
        Same monolith judgments as the screen. New writer, and the third mark language. Hover the
        crown, then read the notes underneath. Cognition first, then August, then Hebbia, then Bland.
      </p>
      {reviews.map((review) => (
        <section className="review-card" key={review.slug}>
          <h2>{review.name}</h2>
          <p className="review-why">{review.why}</p>
          <p className="review-why">{kickerFor(review)}</p>
          {review.failure ? (
            <p className="review-fail">{review.failure}</p>
          ) : (
            <>
              <div className="review-crown">
                <HowItWinsEdge display={displayFromRead(review.read)} prefersReducedMotion={reduced} />
              </div>
              <ReadText read={review.read} />
            </>
          )}
        </section>
      ))}
    </main>
  );
}

const reviews = window.__KNOWN_COMPANY_REVIEWS__;
if (!reviews) throw new Error("known-company review data did not load");
const root = document.getElementById("root");
if (!root) throw new Error("missing root");
createRoot(root).render(<App reviews={reviews} />);
