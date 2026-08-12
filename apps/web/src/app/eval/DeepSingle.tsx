"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { INVERSE_CHIPS, POSITIVE_CHIPS, type CorpusIndexRow } from "./types";

const ALL_CHIPS = [...POSITIVE_CHIPS, ...INVERSE_CHIPS];
const TIERS = ["S", "A", "B"] as const;
const LAYERS = ["facts", "read", "both"] as const;

type Phase = "judging" | "submitting" | "revealed";

export function DeepSingle({ slug }: { slug: string }) {
  const router = useRouter();
  const [tier, setTier] = useState<(typeof TIERS)[number] | null>(null);
  const [layers, setLayers] = useState<(typeof LAYERS)[number]>("both");
  const [chips, setChips] = useState<string[]>([]);
  const [missingComps, setMissingComps] = useState("");
  const [knowsSpace, setKnowsSpace] = useState(false);
  const [note, setNote] = useState("");
  const [phase, setPhase] = useState<Phase>("judging");
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState<CorpusIndexRow | null>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const compsRef = useRef<HTMLInputElement>(null);

  const submit = useCallback(async () => {
    if (!tier || phase !== "judging") return;
    setPhase("submitting");
    setError(null);
    try {
      const response = await fetch("/eval/api/ledger", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "deep-single",
          slug,
          tier,
          layers,
          chips,
          missingComps: missingComps
            .split(",")
            .map((name) => name.trim())
            .filter(Boolean),
          note,
          knowsSpace
        })
      });
      if (!response.ok) throw new Error(`status ${response.status}`);
      const payload = (await response.json()) as { reveal: CorpusIndexRow[] };
      setReveal(payload.reveal[0] ?? null);
      setPhase("revealed");
    } catch {
      // Never auto-advance on failure; a lost judgment is the one unacceptable failure.
      setPhase("judging");
      setError("verdict did not save; retry");
    }
  }, [tier, phase, slug, layers, chips, missingComps, note, knowsSpace]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (phase === "revealed") return;
      const inText =
        document.activeElement === noteRef.current || document.activeElement === compsRef.current;
      if (inText) {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          void submit();
        }
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "s" || key === "a" || key === "b") {
        setTier(key.toUpperCase() as (typeof TIERS)[number]);
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

  useEffect(() => {
    if (tier && phase === "judging") noteRef.current?.focus();
  }, [tier, phase]);

  if (phase === "revealed") {
    return (
      <section className="eval-reveal">
        <h2>Filed metadata</h2>
        <div className="eval-reveal-row">
          <strong>{slug}</strong>
          {reveal ? (
            <p>
              {reveal.eraBucket} · filed {reveal.createdAt.slice(0, 10)} · cost{" "}
              {reveal.costUsd === null ? "unknown" : `$${reveal.costUsd.toFixed(4)}`}
              {reveal.routing
                ? ` · ${Object.entries(reveal.routing)
                    .map(([stage, model]) => `${stage}: ${model}`)
                    .join(", ")}`
                : ""}
            </p>
          ) : (
            <p>no filed metadata</p>
          )}
        </div>
        <button type="button" onClick={() => router.refresh()}>
          next finalist
        </button>
      </section>
    );
  }

  return (
    <section className="eval-controls">
      <div className="eval-verdict-row">
        <span className="eval-verdict-label">Tier (s/a/b)</span>
        {TIERS.map((option) => (
          <button
            key={option}
            type="button"
            className={`eval-chip${tier === option ? " is-on" : ""}`}
            onClick={() => setTier(option)}
          >
            {option}
          </button>
        ))}
      </div>
      <div className="eval-verdict-row">
        <span className="eval-verdict-label">What earns it</span>
        {LAYERS.map((option) => (
          <button
            key={option}
            type="button"
            className={`eval-chip${layers === option ? " is-on" : ""}`}
            onClick={() => setLayers(option)}
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
        <button
          type="button"
          className={`eval-chip eval-chip-context${knowsSpace ? " is-on" : ""}`}
          onClick={() => setKnowsSpace((current) => !current)}
        >
          I know this space
        </button>
      </div>
      <input
        ref={compsRef}
        className="eval-missing-comps"
        placeholder="missing comps, comma-separated"
        value={missingComps}
        onChange={(event) => setMissingComps(event.target.value)}
      />
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
        disabled={!tier || phase === "submitting"}
        onClick={() => void submit()}
      >
        {phase === "submitting" ? "saving…" : tier ? `log verdict: ${tier}` : "pick a tier (s/a/b)"}
      </button>
    </section>
  );
}
