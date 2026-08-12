"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CondensedCard } from "./CondensedCard";
import { POSITIVE_CHIPS, type CondensedView, type CorpusIndexRow } from "./types";

type Phase = "picking" | "submitting" | "revealed";

export function QuickPickRound({ roundIndex, views }: { roundIndex: number; views: CondensedView[] }) {
  const router = useRouter();
  const group = views.map((view) => view.slug);
  const [winner, setWinner] = useState<string | null>(null);
  const [runnerUp, setRunnerUp] = useState<string | null>(null);
  const [chips, setChips] = useState<string[]>([]);
  const [knowsSpace, setKnowsSpace] = useState(false);
  const [note, setNote] = useState("");
  const [phase, setPhase] = useState<Phase>("picking");
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState<CorpusIndexRow[]>([]);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  const pickWinner = useCallback((slug: string) => {
    setWinner(slug);
    setRunnerUp((current) => (current === slug ? null : current));
  }, []);

  const toggleRunnerUp = useCallback(
    (slug: string) => {
      if (slug === winner) return;
      setRunnerUp((current) => (current === slug ? null : slug));
    },
    [winner]
  );

  const submit = useCallback(async () => {
    if (!winner || phase === "submitting" || phase === "revealed") return;
    setPhase("submitting");
    setError(null);
    try {
      const response = await fetch("/eval/api/ledger", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "quick-pick",
          roundIndex,
          group,
          winner,
          ...(runnerUp ? { runnerUp } : {}),
          chips,
          note,
          knowsSpace
        })
      });
      if (!response.ok) throw new Error(`status ${response.status}`);
      const payload = (await response.json()) as { reveal: CorpusIndexRow[] };
      setReveal(payload.reveal);
      setPhase("revealed");
    } catch {
      // Never auto-advance on failure; a lost judgment is the one unacceptable failure.
      setPhase("picking");
      setError("pick did not save; retry");
    }
  }, [winner, phase, roundIndex, group, runnerUp, chips, note, knowsSpace]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (phase === "revealed") return;
      const inNote = document.activeElement === noteRef.current;
      // event.code, not event.key: shift+3 yields key "#" on US layouts.
      const digitMatch = /^Digit([1-9])$/.exec(event.code);
      const digit = digitMatch ? Number(digitMatch[1]) : NaN;
      // The note autofocuses after a winner is picked, so shift+digit must keep
      // working from inside it or the runner-up shortcut is unreachable.
      if (digit >= 1 && digit <= views.length && (!inNote || event.shiftKey)) {
        if (event.shiftKey) toggleRunnerUp(group[digit - 1]);
        else pickWinner(group[digit - 1]);
        event.preventDefault();
        return;
      }
      if (event.key === "Enter" && (!inNote || event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        void submit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, views.length, group, pickWinner, toggleRunnerUp, submit]);

  useEffect(() => {
    if (winner && phase === "picking") noteRef.current?.focus();
  }, [winner, phase]);

  if (phase === "revealed") {
    return (
      <section className="eval-reveal">
        <h2>Filed metadata</h2>
        {group.map((slug) => {
          const row = reveal.find((r) => r.slug === slug);
          return (
            <div key={slug} className="eval-reveal-row">
              <strong>
                {slug}
                {slug === winner ? " · winner" : slug === runnerUp ? " · runner-up" : ""}
              </strong>
              {row ? (
                <p>
                  {row.eraBucket} · filed {row.createdAt.slice(0, 10)} · cost{" "}
                  {row.costUsd === null ? "unknown" : `$${row.costUsd.toFixed(4)}`}
                  {row.routing
                    ? ` · ${Object.entries(row.routing)
                        .map(([stage, model]) => `${stage}: ${model}`)
                        .join(", ")}`
                    : ""}
                </p>
              ) : (
                <p>no filed metadata</p>
              )}
            </div>
          );
        })}
        <button type="button" onClick={() => router.refresh()}>
          next round
        </button>
      </section>
    );
  }

  return (
    <section>
      <div className="eval-grid">
        {views.map((view, i) => (
          <div
            key={view.slug}
            className={`eval-pick-cell${winner === view.slug ? " is-winner" : ""}${
              runnerUp === view.slug ? " is-runner-up" : ""
            }`}
          >
            <button type="button" className="eval-pick-target" onClick={() => pickWinner(view.slug)}>
              <CondensedCard view={view} position={i + 1} />
            </button>
            {winner && winner !== view.slug ? (
              <button
                type="button"
                className="eval-runner-up-control"
                onClick={() => toggleRunnerUp(view.slug)}
              >
                {runnerUp === view.slug ? "runner-up ✓" : "runner-up"}
              </button>
            ) : null}
          </div>
        ))}
      </div>
      <div className="eval-controls">
        <div className="eval-chips">
          {POSITIVE_CHIPS.map((chip) => (
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
          <button
            type="button"
            className={`eval-chip eval-chip-context${knowsSpace ? " is-on" : ""}`}
            onClick={() => setKnowsSpace((current) => !current)}
          >
            I know this space
          </button>
        </div>
        <textarea
          ref={noteRef}
          className="eval-note"
          placeholder="optional note (dictate freely)"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
        {error ? <p className="eval-error">{error}</p> : null}
        <button type="button" className="eval-submit" disabled={!winner || phase === "submitting"} onClick={() => void submit()}>
          {phase === "submitting" ? "saving…" : winner ? `log pick: ${winner}` : "pick a winner (1-4)"}
        </button>
      </div>
    </section>
  );
}
