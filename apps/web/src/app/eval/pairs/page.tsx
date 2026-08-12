import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ColdStartCard, ResearchSection } from "@cold-start/core";
import { CardTexture } from "../../CardTexture";
import { CardFace } from "../../../components/card/CardFace";
import { assertEvalRigEnabled, dataDir } from "../gate";
import { readLedger } from "../rig-data";
import { LensView } from "../LensView";
import { PairPick } from "../PairPick";

export const dynamic = "force-dynamic";

type PairPlanEntry = { pairId: string; slug: string; arms: { A: string; B: string } };

async function readPairsPlan(): Promise<PairPlanEntry[]> {
  try {
    const raw = await readFile(path.join(dataDir(), "pairs-plan.json"), "utf8");
    const parsed = JSON.parse(raw) as { pairs?: PairPlanEntry[] };
    return Array.isArray(parsed.pairs) ? parsed.pairs : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function readArmFile(relPath: string): Promise<{ card: ColdStartCard; sections: ResearchSection[] }> {
  const base = path.resolve(dataDir());
  const resolved = path.resolve(base, relPath);
  // Arm paths come from the plan file, but keep them jailed to the data dir anyway.
  if (!resolved.startsWith(base + path.sep)) {
    throw new Error(`arm path escapes the data dir: ${relPath}`);
  }
  const parsed = JSON.parse(await readFile(resolved, "utf8")) as {
    card: ColdStartCard;
    sections?: ResearchSection[];
  };
  return { card: parsed.card, sections: parsed.sections ?? [] };
}

function Dossier({ label, card, sections }: { label: "A" | "B"; card: ColdStartCard; sections: ResearchSection[] }) {
  const { synthesis, synthesisWithheld: _synthesisWithheld, ...publicCard } = card;
  void _synthesisWithheld;
  return (
    <div className="eval-pair-arm">
      <h2 className="eval-pair-label">{label}</h2>
      <div className="cs-card-page">
        <CardFace
          card={publicCard as Parameters<typeof CardFace>[0]["card"]}
          sections={sections}
          texture={<CardTexture />}
        />
      </div>
      <LensView synthesis={synthesis ?? null} />
    </div>
  );
}

export default async function PairsPage() {
  assertEvalRigEnabled();
  const [pairs, events] = await Promise.all([readPairsPlan(), readLedger()]);

  if (pairs.length === 0) {
    return (
      <main>
        <h1>No pairs planned</h1>
        <p>Author pairs-plan.json in the data dir to start blind pairs.</p>
      </main>
    );
  }

  const judged = new Set(events.filter((event) => event.kind === "pair").map((event) => event.pairId));
  const pair = pairs.find((entry) => !judged.has(entry.pairId));
  if (!pair) {
    return (
      <main>
        <h1>Pairs complete</h1>
      </main>
    );
  }

  const [armA, armB] = await Promise.all([readArmFile(pair.arms.A), readArmFile(pair.arms.B)]);

  return (
    <main>
      <p className="eval-progress">
        Pair {judged.size + 1} of {pairs.length} · {pair.slug}
      </p>
      <h1 className="eval-question">Which read makes you smartest about this company?</h1>
      <Dossier label="A" card={armA.card} sections={armA.sections} />
      <Dossier label="B" card={armB.card} sections={armB.sections} />
      {/* Keyed by pair: stale pick state must never survive into the next pair. */}
      <PairPick key={pair.pairId} pairId={pair.pairId} slug={pair.slug} />
    </main>
  );
}
