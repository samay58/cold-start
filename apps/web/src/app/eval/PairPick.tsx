"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { INVERSE_CHIPS, POSITIVE_CHIPS } from "./types";

const ALL_CHIPS = [...POSITIVE_CHIPS, ...INVERSE_CHIPS];

type Phase = "picking" | "submitting" | "revealed";

export function PairPick({ pairId, slug }: { pairId: string; slug: string }) {
  const router = useRouter();
  const [winner, setWinner] = useState<"A" | "B" | null>(null);
  const [chips, setChips] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [phase, setPhase] = useState<Phase>("picking");
  const [error, setError] = useState<string | null>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  const submit = useCallback(async () => {
    if (!winner || phase !== "picking") return;
    setPhase("submitting");
    setError(null);
    try {
      const response = await fetch("/eval/api/ledger", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "pair", pairId, slug, winner, chips, note })
      });
      if (!response.ok) throw new Error(`status ${response.status}`);
      setPhase("revealed");
    } catch {
      // Never auto-advance on failure; a lost judgment is the one unacceptable failure.
      setPhase("picking");
      setError("pick did not save; retry");
    }
  }, [winner, phase, pairId, slug, chips, note]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (phase === "revealed") return;
      const inNote = document.activeElement === noteRef.current;
      if (inNote) {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          void submit();
        }
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "a" || key === "b") {
        setWinner(key.toUpperCase() as "A" | "B");
        event.preventDefault();
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        void submit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, submit]);

  if (phase === "revealed") {
    return (
      <section className="eval-reveal">
        <h2>Logged</h2>
        <p>
          {slug}: arm {winner} wins pair {pairId}.
        </p>
        <button type="button" onClick={() => router.refresh()}>
          next pair
        </button>
      </section>
    );
  }

  return (
    <section className="eval-controls">
      <div className="eval-verdict-row">
        <span className="eval-verdict-label">Winner (a/b)</span>
        {(["A", "B"] as const).map((option) => (
          <button
            key={option}
            type="button"
            className={`eval-chip${winner === option ? " is-on" : ""}`}
            onClick={() => setWinner(option)}
          >
            {option}
          </button>
        ))}
      </div>
      <div className="eval-chips">
        {ALL_CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            className={`eval-chip${chips.includes(chip) ? " is-on" : ""}`}
            onClick={() =>
              setChips((current) =>
                current.includes(chip) ? current.filter((c) => c !== chip) : [...current, chip]
              )
            }
          >
            {chip}
          </button>
        ))}
      </div>
      <textarea
        ref={noteRef}
        className="eval-note"
        placeholder="optional note (dictate freely)"
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />
      {error ? <p className="eval-error">{error}</p> : null}
      <button
        type="button"
        className="eval-submit"
        disabled={!winner || phase === "submitting"}
        onClick={() => void submit()}
      >
        {phase === "submitting" ? "saving…" : winner ? `log pick: ${winner}` : "pick a or b"}
      </button>
    </section>
  );
}
