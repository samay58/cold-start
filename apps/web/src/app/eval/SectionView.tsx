import { RESEARCH_SECTION_DEFINITIONS_BY_ID, type ResearchSection } from "@cold-start/core";

export function SectionView({ section }: { section: ResearchSection }) {
  const definition = RESEARCH_SECTION_DEFINITIONS_BY_ID[section.sectionId];
  const items = section.content?.items ?? [];
  return (
    <section className="eval-section">
      <h2>{definition?.title ?? section.sectionId}</h2>
      {section.content?.summary ? <p className="eval-section-summary">{section.content.summary}</p> : null}
      {items.length > 0 ? (
        <ul>
          {items.map((item) => (
            <li key={`${item.label}:${item.text}`}>
              <strong>{item.label}</strong> {item.text}
              <span className="eval-section-citations">
                {item.citationIds.length} citation{item.citationIds.length === 1 ? "" : "s"}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="eval-section-summary">No items on file.</p>
      )}
    </section>
  );
}
