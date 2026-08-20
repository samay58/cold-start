import { howItWinsStrategyById, type HowItWins } from "@cold-start/core";

// Plain rendering of one filed read, shared by the blind arm columns and the deep-single dossier.
// Citation markers stay in the note text: the rig reads the frozen artifact, not the panel.
// Each part of the read gets a quiet heading so a reader can find the pair or the next-up list
// without re-reading the running entries above it.
export function HowItWinsView({ read }: { read: HowItWins }) {
  if (read.status !== "read") {
    const sentence = read.status === "nothing_stands_out" ? read.sentence : undefined;
    return <p className="eval-hiw-empty">{sentence ?? "Not enough filed."}</p>;
  }

  const pairNames = read.pair
    ? read.pair.strategies.map((strategy) => howItWinsStrategyById(strategy).name)
    : [];

  return (
    <div className="eval-hiw">
      <p className="eval-hiw-lede">{read.sentence}</p>
      <p className="eval-hiw-section">Running</p>
      <ol className="eval-hiw-running">
        {read.running.map((entry) => (
          <li key={entry.strategy}>
            <p className="eval-hiw-name">{howItWinsStrategyById(entry.strategy).name}</p>
            <p className="eval-hiw-meaning">{entry.meaning}</p>
            <p className="eval-hiw-note">{entry.note}</p>
          </li>
        ))}
      </ol>
      {read.pair ? (
        <div className="eval-hiw-pair">
          <p className="eval-hiw-section">The pair</p>
          <p className="eval-hiw-name">{pairNames.join(" and ")}</p>
          <p className="eval-hiw-note">{read.pair.note}</p>
          <p className="eval-hiw-note eval-hiw-wrongif">
            <span className="eval-hiw-label">Wrong if</span>
            {read.pair.wrongIf}
          </p>
        </div>
      ) : null}
      {read.next.length > 0 ? (
        <div className="eval-hiw-next-block">
          <p className="eval-hiw-section">Not yet</p>
          <ul className="eval-hiw-next">
            {read.next.map((entry) => (
              <li key={entry.strategy}>
                <p className="eval-hiw-name">{howItWinsStrategyById(entry.strategy).name}</p>
                <p className="eval-hiw-note">{entry.note}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="eval-hiw-note eval-hiw-wrongif eval-hiw-wrongif-final">
        <span className="eval-hiw-label">Wrong if</span>
        {read.wrongIf}
      </p>
    </div>
  );
}
