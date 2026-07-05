import { LENS_WAITS_FOR_PROFILE_REASON } from "./investor-lens";
import type { ColdStartCard, ResearchSection } from "@cold-start/core";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { lazy, Suspense, useEffect, useState } from "react";
import {
  CompanyHeader,
  FactRibbon,
  PeopleLine,
  ProfileSummary,
  SourcesCheckedStamp,
  managementConfidence,
  managementPeople,
  managementSourceCount,
  profileFacts
} from "./CompanyHeader";
import { earlyReadState, formatSavedDate } from "./company-display";
import type { ExtensionResearchRunEvent, ExtensionSourceSummary, GenerationStatus } from "./extension-config";
import { formatElapsed, profileSummaryCopy } from "./extension-format";
import { filedSourceCount } from "./first-payoff-events";
import { ProgressBackground } from "./ProgressBackground";
import { ReadRegion } from "./ReadRegion";
import { RESEARCH_LAYER_CARDS, type ResearchLayerId } from "./research-layer";
import { ResearchTrail } from "./ResearchTrail";
import { SharedTooltip, useSharedTooltip } from "./SharedTooltip";
import { motionTokens } from "./motion-primitives";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

const ResearchLayerPanel = lazy(() =>
  import("./ResearchLayerPanel").then((module) => ({ default: module.ResearchLayerPanel }))
);

type RunState = {
  generationStatus: "queued" | "running";
  startedAt: number;
};

type ActiveSectionRunState = RunState & {
  layerId: ResearchLayerId;
};

export type CompanyArcState =
  | { phase: "intake" }
  | {
      phase: "building";
      events: ExtensionResearchRunEvent[];
      generationStatus: GenerationStatus["status"];
      startedAt: number;
    }
  | {
      phase: "profile";
      card: ColdStartCard;
      sections: ResearchSection[];
      analysisNotice?: string | undefined;
      analysisRun?: RunState | undefined;
      contactRun?: RunState | undefined;
      profileRun?: RunState | undefined;
      activeSectionRun?: ActiveSectionRunState | undefined;
      events?: ExtensionResearchRunEvent[] | undefined;
      sources?: ExtensionSourceSummary[] | undefined;
      cachedAtMs?: number | undefined;
    };

type CompanyArcProps = {
  arc: CompanyArcState;
  domain: string;
  onEditSettings: () => void;
  onRegenerate: () => void;
  onRunAnalysis: () => void;
  onRunSection: (layerId: ResearchLayerId) => void;
  onStart: () => void;
  queuedLayerIds?: ResearchLayerId[] | undefined;
};

function useElapsedMilliseconds(active: boolean, startedAt: number | undefined, tickMs = 1000) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active || !startedAt) {
      return;
    }

    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), tickMs);
    return () => window.clearInterval(interval);
  }, [active, startedAt, tickMs]);

  return startedAt ? Math.max(0, now - startedAt) : 0;
}

function useElapsedSeconds(active: boolean, startedAt?: number) {
  const elapsedMs = useElapsedMilliseconds(active, startedAt, 1000);
  return Math.floor(elapsedMs / 1000);
}

const SEALED_LENS_REASON: Record<"intake" | "building", string> = {
  intake: "Runs on the cited profile once it is filed.",
  building: LENS_WAITS_FOR_PROFILE_REASON
};

// The gated tier, visible from the first second: sealed with its honest reason until a cited
// profile exists, at which point the live control inside the research layer takes over.
function SealedLensRow({ phase }: { phase: "intake" | "building" }) {
  return (
    <div className="cs-investor-lens-control cs-lens-sealed" data-sealed="true">
      <div>
        <strong>Investor Lens</strong>
        <span>{SEALED_LENS_REASON[phase]}</span>
      </div>
      <button className="cs-investor-lens-button" disabled type="button">
        Run Investor Lens
      </button>
    </div>
  );
}

// What the research layer will hold, shown with the real module titles before any of them can
// run. The first four modules preview the shape; the rest are counted, not invented.
// At intake, the note above this stack already states the research scope, so the head here
// only appears once building starts and has its own thing to say (evidence is coming).
function ArcStack({ phase }: { phase: "intake" | "building" }) {
  const previews = RESEARCH_LAYER_CARDS.slice(0, 4);
  const remaining = RESEARCH_LAYER_CARDS.length - previews.length;

  return (
    <section className="cs-arc-stack" aria-label="Research scope">
      {phase === "building" ? (
        <div className="cs-arc-stack-head">
          <span>Research</span>
          <small>Waiting for evidence</small>
        </div>
      ) : null}
      <div className="cs-arc-stack-cards">
        {previews.map((layer, index) => (
          <article className="cs-arc-stack-card" key={layer.id}>
            <span className="cs-arc-stack-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            <span className="cs-arc-stack-copy">
              <strong>{layer.title}</strong>
              <span>{layer.description}</span>
            </span>
          </article>
        ))}
      </div>
      <p className="cs-arc-stack-more">{`+${remaining} more file once the profile is ready`}</p>
      <SealedLensRow phase={phase} />
    </section>
  );
}

export function CompanyArc({
  arc,
  domain,
  onEditSettings,
  onRegenerate,
  onRunAnalysis,
  onRunSection,
  onStart,
  queuedLayerIds
}: CompanyArcProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const { tooltip, triggerProps } = useSharedTooltip(prefersReducedMotion);
  const building = arc.phase === "building" ? arc : null;
  const profile = arc.phase === "profile" ? arc : null;

  const buildingElapsedMs = useElapsedMilliseconds(Boolean(building), building?.startedAt, 120);
  const buildingElapsed = Math.floor(buildingElapsedMs / 1000);
  const analysisElapsedSeconds = useElapsedSeconds(Boolean(profile?.analysisRun), profile?.analysisRun?.startedAt);
  const contactElapsedSeconds = useElapsedSeconds(Boolean(profile?.contactRun), profile?.contactRun?.startedAt);
  const profileElapsedSeconds = useElapsedSeconds(Boolean(profile?.profileRun), profile?.profileRun?.startedAt);
  const activeSectionElapsedSeconds = useElapsedSeconds(Boolean(profile?.activeSectionRun), profile?.activeSectionRun?.startedAt);

  // Warm the research-layer chunk while the profile is still building so the phase change
  // never waits on a lazy import.
  useEffect(() => {
    void import("./ResearchLayerPanel");
  }, []);

  const buildingQueued = Boolean(building && building.generationStatus === "queued" && buildingElapsed < 4);
  const buildingKicker = building ? (buildingQueued ? "Queued" : "Researching") : null;
  const buildingPayoff = building ? earlyReadState(null, building.events) : null;

  const profileRead = profile ? earlyReadState(profile.card, profile.events ?? []) : null;
  const profileIsStale = Boolean(profile && (profile.card.cacheStatus === "stale" || profile.cachedAtMs !== undefined));
  const freshnessLabel = profile && profileIsStale
    ? `Saved ${formatSavedDate(profile.card.generatedAt)}${profile.profileRun || profile.analysisRun || profile.activeSectionRun ? " · refreshing" : ""}`
    : null;
  const profileSummary = profile ? profileSummaryCopy(profile.card) : null;
  const profilePeople = profile ? managementPeople(profile.card) : [];

  return (
    <LayoutGroup id="cold-start-research-layer">
      <main className="cs-research-shell cs-arc" data-phase={arc.phase}>
        <AnimatePresence initial={false}>
          {building ? (
            <motion.div
              animate={{ opacity: 1 }}
              className="cs-arc-mesh"
              exit={{ opacity: 0, transition: { duration: prefersReducedMotion ? 0.12 : 0.6, ease: "easeOut" } }}
              initial={{ opacity: 0 }}
              key="mesh"
              transition={{ duration: prefersReducedMotion ? 0.12 : 0.4, ease: motionTokens.ease }}
            >
              <ProgressBackground />
            </motion.div>
          ) : null}
        </AnimatePresence>

        {arc.phase === "intake" ? (
          <header className="cs-arc-topbar">
            <button aria-label="Open settings" className="cs-start-settings" onClick={onEditSettings} type="button">
              <span aria-hidden="true">...</span>
            </button>
          </header>
        ) : null}

        <CompanyHeader
          card={profile?.card ?? null}
          domain={domain}
          freshnessLabel={freshnessLabel}
          kicker={buildingKicker}
          phase={arc.phase}
          statusSlot={
            arc.phase === "intake" ? null : building ? (
              <div className="cs-company-run-time" aria-label={`Elapsed ${formatElapsed(buildingElapsed)}`}>
                <span>Run</span>
                <strong>{formatElapsed(buildingElapsed)}</strong>
              </div>
            ) : null
          }
          identityChildren={
            profile && profileSummary ? (
              <>
                <ProfileSummary fullSummary={profileSummary.fullSummary} summary={profileSummary.summary} tooltipProps={triggerProps} />
                {profileRead?.showSourcesChecked ? (
                  <SourcesCheckedStamp
                    prefersReducedMotion={prefersReducedMotion}
                    sourceCount={filedSourceCount(profile.events ?? [], profile.sources ?? [])}
                  />
                ) : null}
              </>
            ) : null
          }
        >
          {profile ? (
            <>
              <FactRibbon facts={profileFacts(profile.card)} />
              <PeopleLine
                companyDomain={profile.card.domain}
                contactElapsedSeconds={contactElapsedSeconds}
                contactRun={profile.contactRun}
                confidence={managementConfidence(profile.card)}
                people={profilePeople}
                sourceCount={managementSourceCount(profile.card)}
                tooltipProps={triggerProps}
              />
            </>
          ) : null}
        </CompanyHeader>

        <AnimatePresence initial={false}>
          {building && buildingPayoff?.firstPayoff ? (
            <ReadRegion context="building" firstPayoff={buildingPayoff.firstPayoff} />
          ) : profile && profileRead?.showRead && profileRead.firstPayoff ? (
            <ReadRegion context="profile" firstPayoff={profileRead.firstPayoff} />
          ) : null}
        </AnimatePresence>

        {building ? (
          <>
            <ResearchTrail
              elapsedSeconds={buildingElapsed}
              events={building.events}
              generationStatus={building.generationStatus}
              mode="building"
            />
            <ArcStack phase="building" />
          </>
        ) : null}

        {arc.phase === "intake" ? (
          <>
            <section className="cs-arc-intake" aria-label="Start research">
              <p className="cs-arc-intake-note">
                Build a cited profile from public sources: identity, funding, people, and proof.
              </p>
              <button className="cs-start-primary" onClick={onStart} type="button">
                <span>Begin research</span>
                <svg aria-hidden="true" height="18" viewBox="0 0 18 18" width="18">
                  <path d="M3 9h11" />
                  <path d="m10 4.5 4.5 4.5L10 13.5" />
                </svg>
              </button>
            </section>
            <ArcStack phase="intake" />
          </>
        ) : null}

        {profile ? (
          <Suspense fallback={null}>
            <ResearchLayerPanel
              analysisNotice={profile.analysisNotice}
              analysisRun={profile.analysisRun}
              card={profile.card}
              sections={profile.sections}
              events={profile.events}
              sources={profile.sources}
              contactRun={profile.contactRun}
              elapsedSeconds={analysisElapsedSeconds}
              onRunSection={onRunSection}
              onRunAnalysis={onRunAnalysis}
              onRegenerate={onRegenerate}
              queuedLayerIds={queuedLayerIds}
              profileElapsedSeconds={profileElapsedSeconds}
              profileRun={profile.profileRun}
              activeSectionElapsedSeconds={activeSectionElapsedSeconds}
              activeSectionRun={profile.activeSectionRun}
              tooltipProps={triggerProps}
            />
          </Suspense>
        ) : null}
        <SharedTooltip tooltip={tooltip} />
      </main>
    </LayoutGroup>
  );
}
