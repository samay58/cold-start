import type { ColdStartCard, ResearchSection } from "@cold-start/core";
import { sourceQualityTierRank, type SourceQualityTier } from "@cold-start/core";
import {
  callNumber,
  nextQuestionForCard,
  publicEvidenceText,
  statSlots,
  type PublicCardData
} from "../../lib/card-face/model";
import type { CondensedView, CorpusIndexRow } from "./types";

// The condensed view exposes NO era, routing, cost, or date fields;
// blindness is structural, not cosmetic.
export function buildCondensedView(
  slug: string,
  card: ColdStartCard,
  sections: ResearchSection[],
  index?: Pick<CorpusIndexRow, "sourceCount" | "sourceQuality">
): CondensedView {
  const { synthesis, synthesisWithheld: _synthesisWithheld, ...publicCard } = card;
  void _synthesisWithheld;
  const publicData = publicCard as PublicCardData;

  const stats = statSlots(publicData)
    .filter((slot) => slot.value !== null)
    .map((slot) => ({ label: slot.label, value: slot.value as string }));

  const competition = sections.find((section) => section.sectionId === "competition");
  const comps = (competition?.content?.items ?? []).slice(0, 3).map((item) => {
    const firstClause = (item.text.split(/[.;]/)[0] ?? item.text).trim();
    return publicEvidenceText(`${item.label}: ${firstClause}`, 120);
  });

  return {
    slug,
    name: card.identity.name.value ?? slug,
    callNumber: callNumber(publicData),
    stats,
    thesis: synthesis?.whyItMatters?.text ?? null,
    bullLead: synthesis?.bullCase?.[0]?.text ?? null,
    bearLead: synthesis?.bearCase?.[0]?.text ?? null,
    comps,
    nextQuestion: nextQuestionForCard(publicData, sections)?.question ?? null,
    sourceLine: sourceLineFor(publicData, index)
  };
}

function sourceLineFor(
  card: PublicCardData,
  index?: Pick<CorpusIndexRow, "sourceCount" | "sourceQuality">
): string {
  if (!index) {
    return `${card.citations.length} citations`;
  }
  const topTier = Object.entries(index.sourceQuality)
    .filter(([, count]) => count > 0)
    .sort(
      ([a], [b]) =>
        sourceQualityTierRank(b as SourceQualityTier) - sourceQualityTierRank(a as SourceQualityTier)
    )[0];
  const tierNote = topTier ? ` · ${topTier[1]} ${topTier[0].replace(/_/g, " ")}` : "";
  return `${index.sourceCount} sources${tierNote}`;
}
