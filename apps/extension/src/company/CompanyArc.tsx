import type { ColdStartCard, ResearchSection } from "@cold-start/core";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
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
import type {
  AlphaAccessState,
  ExtensionResearchRunEvent,
  ExtensionSourceSummary,
  GenerationStatus
} from "../shared/extension-config";
import { profileSummaryCopy } from "../shared/extension-format";
import { filedSourceCount } from "./first-payoff-events";
import { ProgressBackground } from "../shared/ProgressBackground";
import { ReadRegion } from "./ReadRegion";
import { RESEARCH_LAYER_CARDS, type ResearchLayerId } from "../research/research-layer";
import { hasResearchProgressAttention, sealLevelFromEvents, whisperCopyFromEvents } from "../research/research-progress";
import { ResearchTrail } from "../research/ResearchTrail";
import { SealInstrument } from "./SealInstrument";
import { SharedTooltip, useSharedTooltip, type TooltipDossier } from "../shared/SharedTooltip";
import { motionTokens } from "../shared/motion-primitives";
import { usePrefersReducedMotion } from "../shared/usePrefersReducedMotion";
import { useAlphaEvent } from "../shared/alpha-event-context";
import type { ActiveSectionRunState, RunState } from "../shared/run-state";

const ResearchLayerPanel = lazy(() =>
  import("../research/ResearchLayerPanel").then((module) => ({ default: module.ResearchLayerPanel }))
);

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
      analysisFailed?: boolean | undefined;
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
  alphaAccess?: AlphaAccessState | null | undefined;
  arc: CompanyArcState;
  domain: string;
  onEditSettings: () => void;
  onRegenerate: () => void;
  onRunAnalysis: (forceRefresh?: boolean) => boolean;
  onRunSection: (layerId: ResearchLayerId) => void;
  onStart: () => void;
  queuedLayerIds?: ResearchLayerId[] | undefined;
};

function AlphaPosture({ access }: { access: AlphaAccessState }) {
  const generationPaused = !access.generationEnabled;
  return (
    <aside className="cs-alpha-posture-note" data-paused={generationPaused} aria-label="Friend alpha status">
      <span className="cs-classification-dot" aria-hidden="true" />
      <div>
        <strong>{generationPaused ? "New research paused" : "Friend alpha allowance"}</strong>
        <p>
          {generationPaused
            ? "Saved profiles and filed Lens results still open."
            : `${access.profile?.remaining ?? "Current"} profiles · ${access.lens?.remaining ?? "Current"} Lens runs left`}
        </p>
        <small>Generating creates or updates a public sourced fact card. It never identifies who requested it.</small>
      </div>
    </aside>
  );
}

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

// A flat filing preview. It shows the real profile modules without turning the intake into a
// stack of nested cards or inventing research that has not happened yet.
function FilingPreview() {
  const previews = RESEARCH_LAYER_CARDS.slice(0, 4);
  const remaining = RESEARCH_LAYER_CARDS.length - previews.length;

  return (
    <section className="cs-intake-file" aria-label="Research scope">
      <div className="cs-intake-file-head">
        <span>What gets filed</span>
        <span>{RESEARCH_LAYER_CARDS.length} sections</span>
      </div>
      <div className="cs-intake-file-rows">
        {previews.map((layer, index) => (
          <div className="cs-intake-file-row" key={layer.id}>
            <span className="cs-intake-file-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            <span className="cs-intake-file-copy">
              <strong>{layer.title}</strong>
              <span>{layer.description}</span>
            </span>
          </div>
        ))}
      </div>
      <p className="cs-intake-file-more">{`+${remaining} more file once the profile is ready`}</p>
    </section>
  );
}

export function CompanyArc({
  alphaAccess,
  arc,
  domain,
  onEditSettings,
  onRegenerate,
  onRunAnalysis,
  onRunSection,
  onStart,
  queuedLayerIds
}: CompanyArcProps) {
  const emitAlphaEvent = useAlphaEvent();
  const prefersReducedMotion = usePrefersReducedMotion();
  const { dockAnchorRef, hideTooltip, tooltip, triggerProps, tooltipInteraction } = useSharedTooltip(prefersReducedMotion);
  const building = arc.phase === "building" ? arc : null;
  const profile = arc.phase === "profile" ? arc : null;
  const firstPayoffViews = useRef(new Set<string>());
  const dossierIntent = useRef<{
    name: string;
    trigger: "focus" | "hover";
  } | null>(null);
  const dossierPinIntent = useRef<{
    name: string;
    trigger: "keyboard" | "pointer";
  } | null>(null);
  const dossierCloseReason = useRef<
    "dismiss_button" | "escape" | "focus_leave" | "pointer_leave" | "trigger"
  >("pointer_leave");
  const previousDossier = useRef<{
    dossier: TooltipDossier;
    id: string;
    personGroup: "founder" | "executive";
    personOrdinal: number;
    pinned: boolean;
  } | null>(null);

  const analysisElapsedSeconds = useElapsedSeconds(Boolean(profile?.analysisRun), profile?.analysisRun?.startedAt);
  const contactElapsedSeconds = useElapsedSeconds(Boolean(profile?.contactRun), profile?.contactRun?.startedAt);
  const profileElapsedSeconds = useElapsedSeconds(Boolean(profile?.profileRun), profile?.profileRun?.startedAt);
  const activeSectionElapsedSeconds = useElapsedSeconds(Boolean(profile?.activeSectionRun), profile?.activeSectionRun?.startedAt);

  // Warm the research-layer chunk while the profile is still building so the phase change
  // never waits on a lazy import.
  useEffect(() => {
    void import("../research/ResearchLayerPanel");
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
  const profileCard = profile?.card ?? null;
  const profilePeople = profileCard ? managementPeople(profileCard) : [];
  const visibleFirstPayoff = buildingPayoff?.firstPayoff
    ?? (profileRead?.showRead ? profileRead.firstPayoff : null);
  const profileStartDisabled = Boolean(
    alphaAccess &&
    (!alphaAccess.generationEnabled || alphaAccess.profile?.remaining === 0)
  );
  const profileStartReason = alphaAccess?.generationEnabled === false
    ? "New research is temporarily paused."
    : alphaAccess?.profile?.remaining === 0
      ? "This invitation has used its fresh profile runs."
      : null;
  const lensUnavailableReason = alphaAccess?.generationEnabled === false
    ? "New research is temporarily paused. Filed Lens results still open."
    : alphaAccess?.lens?.remaining === 0
      ? "This invitation has used its fresh Investor Lens runs."
      : undefined;

  useEffect(() => {
    if (!visibleFirstPayoff) {
      return;
    }
    const viewKey = `${domain}:${visibleFirstPayoff.generatedAt}:${visibleFirstPayoff.status}`;
    if (firstPayoffViews.current.has(viewKey)) {
      return;
    }
    firstPayoffViews.current.add(viewKey);
    emitAlphaEvent("profile.first_payoff_viewed", {
      domain,
      state: visibleFirstPayoff.status
    });
  }, [domain, emitAlphaEvent, visibleFirstPayoff]);

  useEffect(() => {
    if (!profileCard) {
      previousDossier.current = null;
      return;
    }

    const trackedPeople = managementPeople(profileCard);
    const body = tooltip?.body;
    const dossier = typeof body === "object" && body !== null && body.kind === "dossier"
      ? body
      : null;
    const orderedPeople = [
      ...trackedPeople.filter((person) => person.email),
      ...trackedPeople.filter((person) => !person.email)
    ];
    const person = dossier
      ? orderedPeople.find((candidate) => candidate.name.trim() === dossier.name)
      : null;
    const founderNames = new Set(
      (profileCard.team.founders.value ?? []).map((candidate) => candidate.name.trim().toLowerCase())
    );
    const current = dossier && tooltip && person
      ? {
          dossier,
          id: tooltip.id,
          personGroup: founderNames.has(person.name.trim().toLowerCase())
            ? "founder" as const
            : "executive" as const,
          personOrdinal: Math.min(100, Math.max(1, orderedPeople.indexOf(person) + 1)),
          pinned: tooltip.pinned
        }
      : null;
    const previous = previousDossier.current;

    if (previous && (!current || previous.id !== current.id)) {
      emitAlphaEvent("dossier.closed", {
        domain: profileCard.domain,
        personGroup: previous.personGroup,
        personOrdinal: previous.personOrdinal,
        reason: dossierCloseReason.current
      });
      dossierCloseReason.current = "pointer_leave";
    }

    if (current && (!previous || previous.id !== current.id)) {
      const intent = dossierIntent.current;
      emitAlphaEvent("dossier.opened", {
        domain: profileCard.domain,
        personGroup: current.personGroup,
        personOrdinal: current.personOrdinal,
        trigger: intent?.name === current.dossier.name ? intent.trigger : "focus"
      });
    }

    if (current?.pinned && (!previous || previous.id !== current.id || !previous.pinned)) {
      const pinIntent = dossierPinIntent.current;
      emitAlphaEvent("dossier.pinned", {
        domain: profileCard.domain,
        personGroup: current.personGroup,
        personOrdinal: current.personOrdinal,
        trigger: pinIntent?.name === current.dossier.name ? pinIntent.trigger : "keyboard"
      });
    }

    previousDossier.current = current;
  }, [emitAlphaEvent, profileCard, tooltip]);

  function handleDossierClickCapture(event: ReactMouseEvent<HTMLElement>) {
    if (!profile) {
      return;
    }
    const target = event.target instanceof Element ? event.target : null;
    if (!target) {
      return;
    }
    if (target.closest(".cs-dossier-dismiss")) {
      dossierCloseReason.current = "dismiss_button";
      return;
    }

    const current = previousDossier.current;
    if (!current) {
      return;
    }
    const channel = target.closest<HTMLAnchorElement>(".cs-dossier-channel");
    if (channel) {
      const channelName = channel.textContent?.trim().toLowerCase();
      if (channelName === "github" || channelName === "x" || channelName === "site") {
        emitAlphaEvent("dossier.channel_opened", {
          domain: profile.card.domain,
          personGroup: current.personGroup,
          personOrdinal: current.personOrdinal,
          channel: channelName
        });
      }
      return;
    }

    const emailButton = target.closest<HTMLButtonElement>(".cs-dossier-email-copy");
    if (!emailButton || !current.dossier.email) {
      return;
    }
    const observer = new MutationObserver(() => {
      if (!emailButton.textContent?.includes("Copied")) {
        return;
      }
      observer.disconnect();
      emitAlphaEvent("dossier.email_copied", {
        domain: profile.card.domain,
        personGroup: current.personGroup,
        personOrdinal: current.personOrdinal,
        emailPosture: current.dossier.email?.status ?? "observed"
      });
    });
    observer.observe(emailButton, { childList: true, characterData: true, subtree: true });
    window.setTimeout(() => observer.disconnect(), 1600);
  }

  function handleDossierKeyDownCapture(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === "Escape" && (event.target as Element | null)?.closest(".cs-shared-tooltip, .cs-people-person")) {
      dossierCloseReason.current = "escape";
    }
  }

  const trackedTooltipInteraction = {
    ...tooltipInteraction,
    onFocusLeave: () => {
      dossierCloseReason.current = "focus_leave";
      tooltipInteraction.onFocusLeave();
    },
    onPointerLeave: () => {
      dossierCloseReason.current = "pointer_leave";
      tooltipInteraction.onPointerLeave();
    }
  };

  return (
    <LayoutGroup id="cold-start-research-layer">
      <main
        className="cs-research-shell cs-arc"
        data-phase={arc.phase}
        onClickCapture={handleDossierClickCapture}
        onKeyDownCapture={handleDossierKeyDownCapture}
      >
        <AnimatePresence initial={false}>
          {building || (profile && profile.analysisRun) ? (
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

        <header className="cs-arc-topbar">
          <button aria-label="Open settings" className="cs-start-settings" onClick={onEditSettings} type="button">
            <span aria-hidden="true">...</span>
          </button>
        </header>

        <CompanyHeader
          card={profile?.card ?? null}
          dockAnchorRef={profile ? dockAnchorRef : undefined}
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
                <ProfileSummary
                  expandedDescription={profile.card.expandedDescription ?? null}
                  fullSummary={profileSummary.fullSummary}
                  summary={profileSummary.summary}
                  tooltipProps={triggerProps}
                />
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
                prefersReducedMotion={prefersReducedMotion}
                onDossierCloseIntent={(_person, reason) => {
                  dossierCloseReason.current = reason;
                }}
                onDossierIntent={(person, trigger) => {
                  dossierIntent.current = { name: person.name.trim(), trigger };
                }}
                onDossierPinIntent={(person, trigger) => {
                  dossierPinIntent.current = { name: person.name.trim(), trigger };
                }}
                sourceCount={managementSourceCount(profile.card)}
                tooltipProps={triggerProps}
              />
            </>
          ) : null}
        </CompanyHeader>

        {alphaAccess && arc.phase !== "building" ? <AlphaPosture access={alphaAccess} /> : null}

        <AnimatePresence initial={false}>
          {profile && profileRead?.showRead && profileRead.firstPayoff ? (
            <ReadRegion
              context="profile"
              domain={domain}
              firstPayoff={profileRead.firstPayoff}
            />
          ) : null}
        </AnimatePresence>

        {building ? (
          <section className="cs-building-flow" aria-label="Research in progress">
            <Clippings
              clippings={clippingsFromEvents(building.events)}
              companyDomain={domain}
              prefersReducedMotion={prefersReducedMotion}
              variant="carousel"
            />
            <AnimatePresence initial={false}>
              {buildingPayoff?.firstPayoff ? (
                <ReadRegion
                  context="building"
                  domain={domain}
                  firstPayoff={buildingPayoff.firstPayoff}
                />
              ) : null}
            </AnimatePresence>
            <ResearchTrail
              companyDomain={domain}
              events={building.events}
              generationStatus={building.generationStatus}
            />
          </section>
        ) : null}

        {profile ? (
          // The card already filed its sources, so this mount shows the full list at once
          // (AnimatePresence initial={false} in Clippings keeps it quiet and settled, never
          // replaying the building-phase arrival stagger on an already-filed profile).
          <Clippings
            clippings={clippingsFromSources(profile.sources ?? [])}
            companyDomain={domain}
            prefersReducedMotion={prefersReducedMotion}
            variant="filed"
          />
        ) : null}

        {arc.phase === "intake" ? (
          <>
            <section className="cs-arc-intake" aria-label="Start research">
              <p className="cs-arc-intake-note">
                Build a cited profile from public sources: identity, funding, people, and proof.
              </p>
              {profileStartReason ? <p className="cs-arc-intake-limit">{profileStartReason}</p> : null}
              <button className="cs-start-primary" disabled={profileStartDisabled} onClick={onStart} type="button">
                <span>{profileStartDisabled ? "Research unavailable" : "Begin research"}</span>
                <svg aria-hidden="true" height="18" viewBox="0 0 18 18" width="18">
                  <path d="M3 9h11" />
                  <path d="m10 4.5 4.5 4.5L10 13.5" />
                </svg>
              </button>
            </section>
            <FilingPreview />
          </>
        ) : null}

        {profile ? (
          <Suspense fallback={null}>
            <ResearchLayerPanel
              analysisFailed={profile.analysisFailed}
              analysisNotice={profile.analysisNotice}
              analysisRun={profile.analysisRun}
              card={profile.card}
              sections={profile.sections}
              events={profile.events}
              elapsedSeconds={analysisElapsedSeconds}
              onRunSection={onRunSection}
              onRunAnalysis={onRunAnalysis}
              onRegenerate={onRegenerate}
              lensUnavailableReason={lensUnavailableReason}
              queuedLayerIds={queuedLayerIds}
              profileElapsedSeconds={profileElapsedSeconds}
              profileRun={profile.profileRun}
              activeSectionElapsedSeconds={activeSectionElapsedSeconds}
              activeSectionRun={profile.activeSectionRun}
              tooltipProps={triggerProps}
            />
          </Suspense>
        ) : null}
        <SharedTooltip interaction={trackedTooltipInteraction} tooltip={tooltip} />
      </main>
    </LayoutGroup>
  );
}
