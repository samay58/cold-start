"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  HOW_IT_WINS_RATING_LABEL,
  HOW_IT_WINS_RATINGS,
  type HowItWinsRating,
  type HowItWinsReveal
} from "../types";

const PICKS = [
  { value: "A", label: "A" },
  { value: "B", label: "B" },
  { value: "neither", label: "Neither" }
] as const;

const RATING_HINT: Record<HowItWinsRating, string> = {
  ship: "Would ship as written",
  weak: "Right shape, thin or loose",
  slop: "Would not ship"
};

type Phase = "judging" | "submitting" | "revealed";

// The verdict bar stays pinned to the bottom of the viewport so a long read can be judged from
// wherever the eye stopped. It carries the company name and count because the page header scrolls
// away under the two columns.
export function HowItWinsReview({
  slug,
  name,
  position,
  total
}: {
  slug: string;
  name: string;
  position: number;
  total: number;
}) {
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
  const noteRef = useRef<HTMLTextAreaElement | null>(null);

  const ready = pick !== null && ratings.A !== null && ratings.B !== null;

  // Dictated notes run long; the box follows the text instead of scrolling inside four lines.
  useEffect(() => {
    const box = noteRef.current;
    if (!box) return;
    box.style.height = "0px";
    box.style.height = `${Math.min(box.scrollHeight, 280)}px`;
  }, [note]);

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

  const missing = [
    pick === null ? "pick the better read" : null,
    ratings.A === null ? "rate A" : null,
    ratings.B === null ? "rate B" : null
  ].filter(Boolean);

  if (phase === "revealed") {
    const key = reveal?.key;
    // Failure text lands here rather than in the arm column: a provider error body can name the
    // model, so it stays behind the verdict along with the key.
    const failures = (["A", "B"] as const)
      .map((arm) => ({ arm, text: reveal?.failures?.[arm] }))
      .filter((entry): entry is { arm: "A" | "B"; text: string } => Boolean(entry.text));

    return (
      <section className="eval-verdict-bar eval-reveal">
        <div className="eval-verdict-bar-inner">
          <div className="eval-verdict-bar-head">
            <span className="eval-verdict-bar-name">{name}</span>
            <span className="eval-verdict-bar-count">
              {position} of {total} saved
            </span>
          </div>
          <h2>Who wrote which</h2>
          {key ? (
            <p className="eval-reveal-key">
              <span>
                <b>A</b> {key.A}
              </span>
              <span>
                <b>B</b> {key.B}
              </span>
            </p>
          ) : (
            <p>no key on file</p>
          )}
          {failures.map((entry) => (
            <p key={entry.arm} className="eval-hiw-failure">
              {entry.arm} did not come back: {entry.text}
            </p>
          ))}
          <div className="eval-verdict-actions">
            <button type="button" className="eval-submit" onClick={() => router.refresh()}>
              {position < total ? "Next read" : "Show standings"}
            </button>
            <span className="eval-verdict-saved">Saved to the ledger. Close any time; the next read waits.</span>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="eval-verdict-bar">
      <div className="eval-verdict-bar-inner">
        <div className="eval-verdict-bar-head">
          <span className="eval-verdict-bar-name">{name}</span>
          <span className="eval-verdict-bar-count">
            {position} of {total}
          </span>
        </div>
        <div className="eval-verdict-grid">
          <div className="eval-verdict-row">
            <span className="eval-verdict-label">Better read</span>
            <span className="eval-chips">
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
            </span>
          </div>
          {(["A", "B"] as const).map((arm) => (
            <div key={arm} className="eval-verdict-row">
              <span className="eval-verdict-label">Rate {arm}</span>
              <span className="eval-chips">
                {HOW_IT_WINS_RATINGS.map((rating) => (
                  <button
                    key={rating}
                    type="button"
                    title={RATING_HINT[rating]}
                    className={`eval-chip${ratings[arm] === rating ? " is-on" : ""}`}
                    onClick={() => setRatings((current) => ({ ...current, [arm]: rating }))}
                  >
                    {HOW_IT_WINS_RATING_LABEL[rating]}
                  </button>
                ))}
              </span>
            </div>
          ))}
        </div>
        <textarea
          ref={noteRef}
          className="eval-note"
          rows={2}
          placeholder="Optional note. Dictate freely; the box grows."
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
        {error ? <p className="eval-error">{error}</p> : null}
        <div className="eval-verdict-actions">
          <button
            type="button"
            className="eval-submit"
            disabled={!ready || phase === "submitting"}
            onClick={() => void submit()}
          >
            {phase === "submitting" ? "Saving" : "Log verdict"}
          </button>
          <span className="eval-verdict-hint">
            {ready ? "Ship: would ship as written. Weak: right shape, thin. Slop: would not ship." : `Still to do: ${missing.join(", ")}.`}
          </span>
        </div>
      </div>
    </section>
  );
}
