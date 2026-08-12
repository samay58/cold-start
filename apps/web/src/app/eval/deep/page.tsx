import type { ColdStartCard, ResearchSection } from "@cold-start/core";
import Link from "next/link";
import { CardTexture } from "../../CardTexture";
import { CardFace } from "../../../components/card/CardFace";
import { assertEvalRigEnabled } from "../gate";
import { nextDeepSlug, readCardFile, readFinalists, readLedger } from "../rig-data";
import { DeepSingle } from "../DeepSingle";
import { LensView } from "../LensView";
import { SectionView } from "../SectionView";

export const dynamic = "force-dynamic";

export default async function DeepSinglesPage() {
  assertEvalRigEnabled();
  const [finalists, events] = await Promise.all([readFinalists(), readLedger()]);

  if (finalists.length === 0) {
    return (
      <main>
        <h1>No finalists filed</h1>
        <p>Author finalists.json in the data dir to start deep singles.</p>
      </main>
    );
  }

  const slug = nextDeepSlug(finalists, events);
  if (!slug) {
    return (
      <main>
        <h1>Deep singles complete</h1>
        <p className="eval-done-links">
          <Link href="/eval/standings">standings</Link>
        </p>
      </main>
    );
  }

  const file = await readCardFile(slug);
  const card = file.card as ColdStartCard;
  const sections = file.sections as ResearchSection[];
  const { synthesis, synthesisWithheld: _synthesisWithheld, ...publicCard } = card;
  void _synthesisWithheld;
  const competition = sections.find((section) => section.sectionId === "competition") ?? null;
  const judged = events.filter((event) => event.kind === "deep-single").length;

  return (
    <main>
      <p className="eval-progress">
        Deep single {judged + 1} of {finalists.length}
      </p>
      <div className="eval-dossier">
        <div className="cs-card-page">
          <CardFace
            card={publicCard as Parameters<typeof CardFace>[0]["card"]}
            sections={sections}
            texture={<CardTexture />}
          />
        </div>
        <LensView synthesis={synthesis ?? null} />
        {competition ? <SectionView section={competition} /> : null}
      </div>
      {/* Keyed by slug: stale verdict state must never survive into the next finalist. */}
      <DeepSingle key={slug} slug={slug} />
    </main>
  );
}
