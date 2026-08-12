import type { ColdStartCard } from "@cold-start/core";

type Synthesis = NonNullable<ColdStartCard["synthesis"]>;

function fieldLabel(field: string): string {
  return field.replace(/([A-Z])/g, " $1").toLowerCase();
}

export function LensView({ synthesis }: { synthesis: Synthesis | null }) {
  if (!synthesis) {
    return <p className="eval-lens-empty">No investor read on file for this card.</p>;
  }
  const timing = synthesis.marketStructureAndTiming;
  const timingEntries = timing
    ? Object.entries(timing).filter(
        (entry): entry is [string, { text: string; citationIds: string[] }] => entry[1] !== null
      )
    : [];
  return (
    <section className="eval-lens">
      <h2>Investor read</h2>
      <p className="eval-lens-why">{synthesis.whyItMatters.text}</p>
      {synthesis.bullCase.length > 0 ? (
        <div className="eval-lens-block">
          <h3>Bull case</h3>
          <ul>
            {synthesis.bullCase.map((claim) => (
              <li key={claim.text}>{claim.text}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {synthesis.bearCase.length > 0 ? (
        <div className="eval-lens-block">
          <h3>Bear case</h3>
          <ul>
            {synthesis.bearCase.map((claim) => (
              <li key={claim.text}>{claim.text}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {synthesis.openQuestions.length > 0 ? (
        <div className="eval-lens-block">
          <h3>Open questions</h3>
          <ul>
            {synthesis.openQuestions.map((entry) => (
              <li key={entry.question}>
                {entry.question}
                {entry.category ? (
                  <span className="eval-lens-tag">{entry.category.replace(/_/g, " ")}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {timingEntries.length > 0 ? (
        <div className="eval-lens-block">
          <h3>Market structure and timing</h3>
          <ul>
            {timingEntries.map(([field, claim]) => (
              <li key={field}>
                <span className="eval-lens-tag">{fieldLabel(field)}</span> {claim.text}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
