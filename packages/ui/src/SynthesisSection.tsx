import type { ColdStartCard } from "@cold-start/core";

type Synthesis = NonNullable<ColdStartCard["synthesis"]>;
type SynthesisItem = Synthesis["bullCase"][number];

export function SynthesisSection({ synthesis }: { synthesis: Synthesis }) {
  return (
    <section className="cs-section" aria-label="Gated synthesis">
      <p className="cs-synthesis-kicker">Investor lens · Gated</p>
      <h2>Why it might matter</h2>
      <p className="cs-synthesis-lede">{synthesis.whyItMatters.text}</p>

      <div className="cs-synthesis-block" data-rail="bull">
        <h3>Bull case</h3>
        <SynthesisList emptyText="No cited bull case survived verification." items={synthesis.bullCase} />
      </div>

      <div className="cs-synthesis-block" data-rail="bear">
        <h3>Bear case</h3>
        <SynthesisList emptyText="No cited bear case survived verification." items={synthesis.bearCase} />
      </div>

      <div className="cs-synthesis-block" data-rail="open">
        <h3>Open questions</h3>
        {synthesis.openQuestions.length > 0 ? (
          <ul className="cs-synthesis-list">
            {synthesis.openQuestions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        ) : (
          <p className="cs-empty">No open questions generated.</p>
        )}
      </div>
    </section>
  );
}

function SynthesisList({ emptyText, items }: { emptyText: string; items: SynthesisItem[] }) {
  if (items.length === 0) {
    return <p className="cs-empty">{emptyText}</p>;
  }

  return (
    <ul className="cs-synthesis-list">
      {items.map((item) => (
        <li key={item.text}>{item.text}</li>
      ))}
    </ul>
  );
}
