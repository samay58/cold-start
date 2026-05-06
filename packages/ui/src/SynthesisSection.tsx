import type { ColdStartCard } from "@cold-start/core";

type Synthesis = NonNullable<ColdStartCard["synthesis"]>;

export function SynthesisSection({ synthesis }: { synthesis: Synthesis }) {
  return (
    <section className="cs-section" aria-label="Gated synthesis">
      <h2>Why it might matter</h2>
      <p className="cs-synthesis-lede">{synthesis.whyItMatters.text}</p>

      <h3>Bull case</h3>
      <ul className="cs-synthesis-list">
        {synthesis.bullCase.map((item) => (
          <li key={item.text}>{item.text}</li>
        ))}
      </ul>

      <h3>Bear case</h3>
      <ul className="cs-synthesis-list">
        {synthesis.bearCase.map((item) => (
          <li key={item.text}>{item.text}</li>
        ))}
      </ul>

      <h3>Open questions</h3>
      <ul className="cs-synthesis-list">
        {synthesis.openQuestions.map((question) => (
          <li key={question}>{question}</li>
        ))}
      </ul>
    </section>
  );
}
