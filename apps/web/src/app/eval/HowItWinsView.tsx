import { howItWinsStrategyById, type HowItWins } from "@cold-start/core";

// Plain rendering of one filed read, shared by the blind arm columns and the deep-single dossier.
// Citation markers stay in the note text: the rig reads the frozen artifact, not the panel.
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
          <p className="eval-hiw-name">{pairNames.join(" and ")}</p>
          <p className="eval-hiw-note">{read.pair.note}</p>
          <p className="eval-hiw-note">
            <span className="eval-hiw-label">Wrong if</span>
            {read.pair.wrongIf}
          </p>
        </div>
      ) : null}
      {read.next.length > 0 ? (
        <ul className="eval-hiw-next">
          {read.next.map((entry) => (
            <li key={entry.strategy}>
              <p className="eval-hiw-name">{`${howItWinsStrategyById(entry.strategy).name}, not yet`}</p>
              <p className="eval-hiw-note">{entry.note}</p>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="eval-hiw-note">
        <span className="eval-hiw-label">Wrong if</span>
        {read.wrongIf}
      </p>
    </div>
  );
}
