"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import {
  HOW_IT_WINS_RATING_LABEL,
  HOW_IT_WINS_RATINGS,
  type HowItWinsRating,
  type HowItWinsReveal
} from "../types";

const PICKS = [
  { value: "A", label: "Pick A" },
  { value: "B", label: "Pick B" },
  { value: "neither", label: "Neither" }
] as const;

type Phase = "judging" | "submitting" | "revealed";

export function HowItWinsReview({ slug }: { slug: string }) {
  const router = useRouter();
  const [pick, setPick] = useState<(typeof PICKS)[number]["value"] | null>(null);
  const [ratings, setRatings] = useState<{ A: HowItWinsRating | null; B: HowItWinsRating | null }>({
    A: null,
    B: null
  });
  const [note, setNote] = useState("");
  const [phase, setPhase] = useState<Phase>("judging");
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState<HowItWinsReveal | null>(null);

  const ready = pick !== null && ratings.A !== null && ratings.B !== null;

  const submit = useCallback(async () => {
    if (!ready || phase !== "judging") return;
    setPhase("submitting");
    setError(null);
    try {
      const response = await fetch("/eval/api/ledger", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "how-it-wins", slug, pick, ratings, note })
      });
      if (!response.ok) throw new Error(`status ${response.status}`);
      const payload = (await response.json()) as HowItWinsReveal;
      setReveal(payload);
      setPhase("revealed");
    } catch {
      // Never auto-advance on failure; a lost judgment is the one unacceptable failure.
      setPhase("judging");
      setError("verdict did not save; retry");
    }
  }, [ready, phase, slug, pick, ratings, note]);

  if (phase === "revealed") {
    const key = reveal?.key;
    // Failure text lands here rather than in the arm column: a provider error body can name the
    // model, so it stays behind the verdict along with the key.
    const failures = (["A", "B"] as const)
      .map((arm) => ({ arm, text: reveal?.failures?.[arm] }))
      .filter((entry): entry is { arm: "A" | "B"; text: string } => Boolean(entry.text));

    return (
      <section className="eval-reveal">
        <h2>Who wrote which</h2>
        {key ? (
          <p>
            A: {key.A} · B: {key.B}
          </p>
        ) : (
          <p>no key on file</p>
        )}
        {failures.map((entry) => (
          <p key={entry.arm} className="eval-hiw-failure">
            {entry.arm} did not come back: {entry.text}
          </p>
        ))}
        <button type="button" onClick={() => router.refresh()}>
          Next
        </button>
      </section>
    );
  }

  return (
    <section className="eval-controls">
      <p className="eval-progress">Pick the better read, then rate each one.</p>
      <div className="eval-verdict-row">
        <span className="eval-verdict-label">Better read</span>
        {PICKS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`eval-chip${pick === option.value ? " is-on" : ""}`}
            onClick={() => setPick(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {(["A", "B"] as const).map((arm) => (
        <div key={arm} className="eval-verdict-row">
          <span className="eval-verdict-label">{arm}</span>
          {HOW_IT_WINS_RATINGS.map((rating) => (
            <button
              key={rating}
              type="button"
              className={`eval-chip${ratings[arm] === rating ? " is-on" : ""}`}
              onClick={() => setRatings((current) => ({ ...current, [arm]: rating }))}
            >
              {HOW_IT_WINS_RATING_LABEL[rating]}
            </button>
          ))}
        </div>
      ))}
      <textarea
        className="eval-note"
        placeholder="optional note"
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />
      {error ? <p className="eval-error">{error}</p> : null}
      <button
        type="button"
        className="eval-submit"
        disabled={!ready || phase === "submitting"}
        onClick={() => void submit()}
      >
        {phase === "submitting" ? "saving" : "Log verdict"}
      </button>
    </section>
  );
}
