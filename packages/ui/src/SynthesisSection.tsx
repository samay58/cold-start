import type { ColdStartCard } from "@cold-start/core";

type Synthesis = NonNullable<ColdStartCard["synthesis"]>;
type SynthesisItem = Synthesis["bullCase"][number];

export function SynthesisSection({ marker, synthesis }: { marker: string; synthesis: Synthesis }) {
  const supported = synthesis.bullCase.length;

  return (
    <section className="cs-synthesis" aria-label="Investor lens">
      <p className="cs-synthesis-kicker">
        <span>{marker}</span>
        <span className="cs-synthesis-extension">Extension ↗</span>
      </p>
      <h2 className="cs-synthesis-lede">Why it might matter.</h2>
      <p className="cs-synthesis-body">{synthesis.whyItMatters.text}</p>

      <div className="cs-synthesis-block" data-rail="bull">
        <div className="cs-synthesis-block-head">
          <span className="cs-synthesis-block-mark" aria-hidden="true" />
          <span>Supported · {supported} cited</span>
        </div>
        <SynthesisList
          emptyText="No cited support survived verification."
          items={synthesis.bullCase}
          variant="numbered"
        />
      </div>

      <div className="cs-synthesis-block" data-rail="open">
        <div className="cs-synthesis-block-head">
          <span className="cs-synthesis-block-mark" aria-hidden="true" />
          <span>Open questions</span>
        </div>
        {synthesis.openQuestions.length > 0 ? (
          <ul className="cs-synthesis-list">
            {synthesis.openQuestions.map((question) => (
              <li className="cs-synthesis-item" key={question}>
                <span className="cs-synthesis-index" aria-hidden="true">?</span>
                <span className="cs-synthesis-text">{question}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="cs-empty">No open questions generated.</p>
        )}
      </div>
    </section>
  );
}

const ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"];

type ListVariant = "numbered" | "plain";

function SynthesisList({
  emptyText,
  items,
  variant
}: {
  emptyText: string;
  items: SynthesisItem[];
  variant: ListVariant;
}) {
  if (items.length === 0) {
    return <p className="cs-empty">{emptyText}</p>;
  }

  return (
    <ul className="cs-synthesis-list">
      {items.map((item, index) => (
        <li className="cs-synthesis-item" key={item.text}>
          <span className="cs-synthesis-index" aria-hidden="true">
            {variant === "numbered" ? `${ROMAN[index] ?? index + 1}.` : "?"}
          </span>
          <span className="cs-synthesis-text">{item.text}</span>
        </li>
      ))}
    </ul>
  );
}
