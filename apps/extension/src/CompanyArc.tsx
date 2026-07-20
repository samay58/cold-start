import { LENS_WAITS_FOR_PROFILE_REASON } from "./research/investor-lens";
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
import { Clippings } from "./Clippings";
import { clippingsFromEvents, clippingsFromSources } from "./clipping-model";
import { earlyReadState, formatSavedDate } from "./company-display";
import type { ExtensionResearchRunEvent, ExtensionSourceSummary, GenerationStatus } from "./extension-config";
import { profileSummaryCopy } from "./extension-format";
import { filedSourceCount } from "./first-payoff-events";
import { ProgressBackground } from "./ProgressBackground";
import { ReadRegion } from "./ReadRegion";
import { RESEARCH_LAYER_CARDS, type ResearchLayerId } from "./research/research-layer";
import { hasResearchProgressAttention, sealLevelFromEvents, whisperCopyFromEvents } from "./research/research-progress";
import { ResearchTrail } from "./research/ResearchTrail";
import { SealInstrument } from "./SealInstrument";
import { SharedTooltip, useSharedTooltip } from "./SharedTooltip";
import { motionTokens } from "./motion-primitives";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

const ResearchLayerPanel = lazy(() =>
  import("./research/ResearchLayerPanel").then((module) => ({ default: module.ResearchLayerPanel }))
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

// The gated tier stays legible from the first second without presenting a disabled action.
function SealedLensRow() {
  return (
    <div className="cs-lens-sealed" data-sealed="true">
      <strong>Investor Lens</strong>
      <span>{LENS_WAITS_FOR_PROFILE_REASON}</span>
    </div>
  );
}

// What the research layer will hold, shown with the real module titles before any of them can
// run. The first four modules preview the shape; the rest are counted, not invented.
// This only ever mounts at intake: building does not render ArcStack at all, so there is no
// separate head note to state here (the intake note above this stack already covers scope).
function ArcStack() {
  const previews = RESEARCH_LAYER_CARDS.slice(0, 4);
  const remaining = RESEARCH_LAYER_CARDS.length - previews.length;

  return (
    <section className="cs-arc-stack" aria-label="Research scope">
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
      <SealedLensRow />
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
  const { hideTooltip, tooltip, triggerProps, tooltipInteraction } = useSharedTooltip(prefersReducedMotion);
  const building = arc.phase === "building" ? arc : null;
  const profile = arc.phase === "profile" ? arc : null;

  const analysisElapsedSeconds = useElapsedSeconds(Boolean(profile?.analysisRun), profile?.analysisRun?.startedAt);
  const contactElapsedSeconds = useElapsedSeconds(Boolean(profile?.contactRun), profile?.contactRun?.startedAt);
  const profileElapsedSeconds = useElapsedSeconds(Boolean(profile?.profileRun), profile?.profileRun?.startedAt);
  const activeSectionElapsedSeconds = useElapsedSeconds(Boolean(profile?.activeSectionRun), profile?.activeSectionRun?.startedAt);

  // Warm the research-layer chunk while the profile is still building so the phase change
  // never waits on a lazy import.
  useEffect(() => {
    void import("./research/ResearchLayerPanel");
  }, []);

  const buildingSealLevel = building ? sealLevelFromEvents(building.events) : 0;
  const buildingAttention = building ? hasResearchProgressAttention(building.events) : false;
  const buildingWhisper = building
    ? buildingAttention
      ? "Needs a closer look"
      : whisperCopyFromEvents(building.events, domain)
    : null;
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
          phase={arc.phase}
          statusSlot={
            arc.phase === "intake" ? null : building ? (
              <div
                aria-live="polite"
                className="cs-assembly-whisper"
                data-attention={buildingAttention ? "true" : "false"}
              >
                <SealInstrument level={buildingSealLevel} prefersReducedMotion={prefersReducedMotion} />
                <span className="cs-assembly-whisper-copy">{buildingWhisper}</span>
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
                hideTooltip={hideTooltip}
                citations={profile.card.citations}
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
            <Clippings clippings={clippingsFromEvents(building.events)} prefersReducedMotion={prefersReducedMotion} />
            <ResearchTrail events={building.events} generationStatus={building.generationStatus} />
            <SealedLensRow />
          </>
        ) : null}

        {profile ? (
          // The card already filed its sources, so this mount shows the full list at once
          // (AnimatePresence initial={false} in Clippings keeps it quiet and settled, never
          // replaying the building-phase arrival stagger on an already-filed profile).
          <Clippings clippings={clippingsFromSources(profile.sources ?? [])} prefersReducedMotion={prefersReducedMotion} />
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
            <ArcStack />
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
        <SharedTooltip interaction={tooltipInteraction} tooltip={tooltip} />
      </main>
    </LayoutGroup>
  );
}
