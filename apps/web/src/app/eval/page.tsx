import type { ColdStartCard, ResearchSection } from "@cold-start/core";
import Link from "next/link";
import { assertEvalRigEnabled } from "./gate";
import { buildCondensedView } from "./condensed";
import { nextQuickPickRound, readCardFile, readLedger, readSessionPlan } from "./rig-data";
import { QuickPickRound } from "./QuickPickRound";

export const dynamic = "force-dynamic";

export default async function EvalPage() {
  assertEvalRigEnabled();
  const [plan, events] = await Promise.all([readSessionPlan(), readLedger()]);
  const round = nextQuickPickRound(plan, events);

  if (!round) {
    return (
      <main>
        <h1>Rounds complete</h1>
        <p className="eval-done-links">
          <Link href="/eval/deep">deep singles</Link> · <Link href="/eval/standings">standings</Link>
        </p>
      </main>
    );
  }

  const files = await Promise.all(round.slugs.map((slug) => readCardFile(slug)));
  const views = files.map((file, i) =>
    buildCondensedView(
      round.slugs[i],
      file.card as ColdStartCard,
      file.sections as ResearchSection[],
      file.index
    )
  );

  return (
    <main>
      <p className="eval-progress">
        Round {round.index + 1} of {plan.rounds.length}
      </p>
      <h1 className="eval-question">Which one makes you smartest about its company?</h1>
      {/* Keyed by round: router.refresh() reconciles in place, and stale pick
          state from the previous round must never survive into the next. */}
      <QuickPickRound key={round.index} roundIndex={round.index} views={views} />
    </main>
  );
}
