import { useEffect, useRef, useState } from "react";
import type { FocusEvent, KeyboardEvent, MouseEvent, PointerEvent } from "react";

export type TooltipPlacement = "above" | "below";

// "popover" positions relative to its own trigger and can appear above or below it (today's
// behavior). "docked" always renders below a fixed anchor (dockAnchorRef) regardless of which
// trigger opened it, so a list of siblings shares one stable region instead of a card that
// jumps to follow the row under the pointer.
export type TooltipMode = "popover" | "docked";

// A structured person dossier. The visible people row keeps identity only; everything
// cited, contextual, or contact-related lives here. `read` is null when the evidence
// supports no honest claim.
export type TooltipDossier = {
  kind: "dossier";
  name: string;
  role: string | null;
  read: { text: string; citationIds: string[] } | null;
  provenance: string | null;
  email: { address: string; basis: string | null; status: "observed" | "inferred" } | null;
  channels: Array<{ label: "GitHub" | "X" | "Site"; url: string }>;
};

type TooltipBody = string | TooltipDossier;

type SharedTooltipState = {
  animate: boolean;
  body: TooltipBody;
  id: string;
  left: number;
  // The room actually available between the trigger and the viewport edge in the
  // placement direction, so a long dossier read is only clipped when the viewport truly
  // has no space rather than by a fixed cap.
  maxHeight: number;
  mode: TooltipMode;
  // True only when the dossier is pinned open (by keyboard or click): focus lives inside it
  // and it ignores pointer-leave until Escape, a re-click, or a focus-out hands control back
  // to the row.
  pinned: boolean;
  placement: TooltipPlacement;
  title: string;
  top: number;
  width: number;
};

export type TooltipTriggerProps = {
  "aria-describedby": string;
  onBlur: (event: FocusEvent<HTMLElement>) => void;
  // Pin is a semantic promotion (WAI-ARIA APG): the unpinned dossier is informational, the
  // pinned dossier is a real interactive region. Click extends the existing keyboard (Enter)
  // pin path; no-op for plain-text (non-dossier) triggers.
  onClick: (event: MouseEvent<HTMLElement>) => void;
  onFocus: (event: FocusEvent<HTMLElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  onPointerEnter: (event: PointerEvent<HTMLElement>) => void;
  onPointerLeave: (event: PointerEvent<HTMLElement>) => void;
};

// The interaction surface for the tooltip element itself. Every variant wires these now:
// the plain string tooltip is as reachable as the dossier, so entering either tooltip body
// cancels its pending close the same way.
export type TooltipInteraction = {
  onDismiss: () => void;
  onFocusLeave: () => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
};

// The shape components accept to wire a trigger, so consumers depend on the primitive
// without owning the tooltip state.
export type TooltipPropsFor = (input: {
  body: TooltipBody;
  id: string;
  // Defaults to "popover". "docked" is for a fixed list of siblings that should share one
  // stable region below a common anchor (dockAnchorRef) rather than a card that follows the
  // trigger.
  mode?: TooltipMode;
  placement?: TooltipPlacement;
  title: string;
}) => TooltipTriggerProps;

const SHARED_TOOLTIP_ID = "cs-company-shared-tooltip";

// Grace window between leaving the trigger and reaching the tooltip. Long enough to bridge
// the 10px gap without the tooltip vanishing, short enough to still feel immediate. Applies
// to every tooltip variant.
const HIDE_GRACE_MS = 160;

// Delay between hover-enter and committing the tooltip open, so a pointer merely passing over
// a trigger on its way elsewhere never opens one (no strobe). Sized to a low accidental-hover
// surface (a discrete row list), not the 650-700ms Radix/Wikipedia use for dense prose or
// ambient dropdowns; see docs/product/gold-standard-references.md, hovercard track. This is a
// timing device, not motion, so it applies the same under prefers-reduced-motion. Focus/
// keyboard open and a hot retarget between docked siblings both skip it entirely.
const OPEN_INTENT_MS = 90;

// Fixed margin from the panel edge in docked mode: both side margins and the bottom clearance
// the max-height calculation leaves above the viewport edge.
const DOCK_MARGIN = 16;

// Gap between the dock anchor's bottom edge and the docked region, mirroring the 10px gap
// popover mode leaves between a trigger and its card.
const DOCK_GAP = 6;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function asDossier(body: TooltipBody): TooltipDossier | null {
  return typeof body === "object" && body !== null && body.kind === "dossier" ? body : null;
}

function popoverGeometry(
  target: HTMLElement,
  placement: TooltipPlacement
): { left: number; maxHeight: number; placement: TooltipPlacement; top: number; width: number } {
  const rect = target.getBoundingClientRect();
  const width = Math.min(340, Math.max(240, window.innerWidth - 32));
  const left = clamp(rect.left + rect.width / 2 - width / 2, 16, Math.max(16, window.innerWidth - width - 16));
  const gap = 10;
  const top = placement === "above" ? rect.top - gap : rect.bottom + gap;
  // Size to the room actually available between the trigger and the viewport edge in the
  // placement direction, so a long dossier read is only clipped when the viewport truly
  // has no space, never by an arbitrary fixed cap. The 160px floor keeps a degenerate
  // near-edge trigger from collapsing the tooltip to an unreadable sliver; a visible
  // scrollbar (styles.css) carries the rest when that floor is still not enough.
  const viewportMargin = 16;
  const available = placement === "above"
    ? rect.top - gap - viewportMargin
    : window.innerHeight - rect.bottom - gap - viewportMargin;
  const maxHeight = Math.max(160, available);
  return { left, maxHeight, placement, top, width };
}

// Docked geometry ignores the trigger entirely: every docked trigger positions the same fixed
// region below dockAnchorRef, so retargeting between siblings never moves the card, only its
// content changes. Falls back to the trigger's own rect if the anchor never mounted (e.g. a
// test harness that doesn't render one).
function dockedGeometry(
  target: HTMLElement,
  anchor: HTMLElement | null
): { left: number; maxHeight: number; placement: TooltipPlacement; top: number; width: number } {
  const anchorRect = anchor?.getBoundingClientRect() ?? target.getBoundingClientRect();
  const top = anchorRect.bottom + DOCK_GAP;
  const width = Math.max(160, window.innerWidth - DOCK_MARGIN * 2);
  const roomBelow = window.innerHeight - top - DOCK_MARGIN;
  const maxHeight = Math.max(120, Math.min(window.innerHeight * 0.6, roomBelow));
  return { left: DOCK_MARGIN, maxHeight, placement: "below", top, width };
}

export function useSharedTooltip(prefersReducedMotion: boolean) {
  const [tooltip, setTooltip] = useState<SharedTooltipState | null>(null);
  const previousTooltipId = useRef<string | null>(null);
  const previousTooltipMode = useRef<TooltipMode | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinnedRef = useRef(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  // The element the docked region attaches below. CompanyHeader renders a zero-height marker
  // just under the people block and attaches this ref to it; docked geometry reads that
  // marker's rect instead of the trigger's own.
  const dockAnchorRef = useRef<HTMLDivElement | null>(null);

  function clearHideTimer() {
    if (hideTimer.current !== null) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }

  function clearIntentTimer() {
    if (intentTimer.current !== null) {
      clearTimeout(intentTimer.current);
      intentTimer.current = null;
    }
  }

  function commitTooltip(
    input: { body: TooltipBody; id: string; mode?: TooltipMode; placement?: TooltipPlacement; title: string },
    target: HTMLElement,
    pinned: boolean
  ) {
    clearHideTimer();
    const mode = input.mode ?? "popover";
    const previousId = previousTooltipId.current;
    // A position/content transition only plays between two tooltips of the same mode: a fresh
    // dock open arriving from an unrelated popover elsewhere on the page should not inherit a
    // stray animation, and vice versa.
    const isRetarget = Boolean(previousId && previousId !== input.id && previousTooltipMode.current === mode);
    previousTooltipId.current = input.id;
    previousTooltipMode.current = mode;
    pinnedRef.current = pinned;

    const geometry = mode === "docked"
      ? dockedGeometry(target, dockAnchorRef.current)
      : popoverGeometry(target, input.placement ?? "above");

    setTooltip({
      animate: Boolean(isRetarget && !prefersReducedMotion),
      body: input.body,
      id: input.id,
      mode,
      pinned,
      title: input.title,
      ...geometry
    });
  }

  function hideTooltip() {
    clearHideTimer();
    clearIntentTimer();
    pinnedRef.current = false;
    setTooltip(null);
  }

  function scheduleHide() {
    clearHideTimer();
    hideTimer.current = setTimeout(() => {
      hideTimer.current = null;
      if (!pinnedRef.current) {
        setTooltip(null);
      }
    }, HIDE_GRACE_MS);
  }

  // While a docked tooltip is open, the panel underneath it can scroll; recompute against the
  // live anchor rect so the region tracks the people block instead of drifting out of place.
  // Depends only on this derived boolean, not `tooltip` itself: the effect's own setTooltip
  // call below patches top/maxHeight on every scroll tick, so depending on `tooltip` directly
  // would tear the listener down and rebuild it on every recomputed frame.
  const dockedOpen = tooltip !== null && tooltip.mode === "docked";

  useEffect(() => {
    if (!dockedOpen) {
      return;
    }

    function reposition() {
      const anchorRect = dockAnchorRef.current?.getBoundingClientRect();
      if (!anchorRect) {
        return;
      }
      const top = anchorRect.bottom + DOCK_GAP;
      const roomBelow = window.innerHeight - top - DOCK_MARGIN;
      const maxHeight = Math.max(120, Math.min(window.innerHeight * 0.6, roomBelow));
      setTooltip((current) => (current && current.mode === "docked" ? { ...current, maxHeight, top } : current));
    }

    // Scroll events don't bubble, so listening on window only works in the capture phase.
    window.addEventListener("scroll", reposition, true);
    return () => window.removeEventListener("scroll", reposition, true);
  }, [dockedOpen]);

  function triggerProps(input: {
    body: TooltipBody;
    id: string;
    mode?: TooltipMode;
    placement?: TooltipPlacement;
    title: string;
  }): TooltipTriggerProps {
    const interactive = asDossier(input.body) !== null;

    return {
      "aria-describedby": SHARED_TOOLTIP_ID,
      onBlur: (event) => {
        // While pinned, focus is intentionally leaving the row for the tooltip; keep it up.
        if (pinnedRef.current) {
          return;
        }
        const nextTarget = event.relatedTarget;
        if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
          return;
        }
        hideTooltip();
      },
      onClick: (event) => {
        if (!interactive) {
          return;
        }
        clearIntentTimer();
        const alreadyPinnedHere = pinnedRef.current && previousTooltipId.current === input.id;
        if (alreadyPinnedHere) {
          // Second click demotes the dossier back to its informational, unpinned state. It
          // stays open (the pointer is still over the row) and closes normally on leave.
          pinnedRef.current = false;
          setTooltip((current) => (current && current.id === input.id ? { ...current, pinned: false } : current));
          return;
        }
        triggerRef.current = event.currentTarget;
        commitTooltip(input, event.currentTarget, true);
      },
      onFocus: (event) => {
        clearIntentTimer();
        commitTooltip(input, event.currentTarget, false);
      },
      onKeyDown: (event) => {
        if (!interactive) {
          return;
        }
        if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
          event.preventDefault();
          clearIntentTimer();
          triggerRef.current = event.currentTarget;
          commitTooltip(input, event.currentTarget, true);
        }
      },
      onPointerEnter: (event) => {
        // A pinned dossier holds until it is explicitly dismissed or re-clicked; a passing
        // hover over a sibling row must never silently steal the pin.
        if (pinnedRef.current) {
          return;
        }
        clearHideTimer();
        const target = event.currentTarget;
        const requestedMode = input.mode ?? "popover";
        // Retarget goes hot: once a docked tooltip is open, moving to another docked trigger
        // skips the intent delay and commits straight to the 140ms content crossfade
        // (FloatingDelayGroup pattern). The 90ms price is paid once per dock session.
        const hot = requestedMode === "docked" && tooltip !== null && tooltip.mode === "docked";
        clearIntentTimer();
        if (hot) {
          commitTooltip(input, target, false);
          return;
        }
        intentTimer.current = setTimeout(() => {
          intentTimer.current = null;
          commitTooltip(input, target, false);
        }, OPEN_INTENT_MS);
      },
      onPointerLeave: () => {
        if (pinnedRef.current) {
          return;
        }
        if (intentTimer.current !== null) {
          // The intent timer never fired, so the tooltip never opened. Cancel silently: no
          // strobe.
          clearIntentTimer();
          return;
        }
        // Every tooltip variant is reachable now, so give the pointer a grace window to
        // bridge the gap between the trigger and the tooltip body before closing it.
        scheduleHide();
      }
    };
  }

  const tooltipInteraction: TooltipInteraction = {
    onDismiss: () => {
      const trigger = triggerRef.current;
      hideTooltip();
      trigger?.focus();
    },
    onFocusLeave: hideTooltip,
    onPointerEnter: clearHideTimer,
    onPointerLeave: () => {
      if (!pinnedRef.current) {
        scheduleHide();
      }
    }
  };

  return { dockAnchorRef, hideTooltip, tooltip, triggerProps, tooltipInteraction };
}

function DossierBody({ dossier }: { dossier: TooltipDossier }) {
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const role = dossier.role?.trim() || "Role not verified";
  const email = dossier.email;

  useEffect(() => {
    return () => {
      if (copyTimer.current !== null) {
        clearTimeout(copyTimer.current);
      }
    };
  }, []);

  async function copyEmail() {
    if (!email || !navigator.clipboard?.writeText) {
      return;
    }
    try {
      await navigator.clipboard.writeText(email.address);
      setCopied(true);
      if (copyTimer.current !== null) {
        clearTimeout(copyTimer.current);
      }
      copyTimer.current = setTimeout(() => setCopied(false), 1400);
    } catch {}
  }

  return (
    <div className="cs-dossier" data-has-read={dossier.read ? "true" : "false"}>
      <p className="cs-dossier-role">{role}</p>
      {dossier.read ? <p className="cs-dossier-read">{dossier.read.text}</p> : null}
      {dossier.provenance ? <p className="cs-dossier-provenance">{dossier.provenance}</p> : null}
      {email ? (
        <div className="cs-dossier-email" data-email-status={email.status}>
          <button
            aria-label={`Copy ${email.address}`}
            className="cs-dossier-email-copy"
            onClick={copyEmail}
            type="button"
          >
            <span className="cs-dossier-email-address">{copied ? "Copied" : email.address}</span>
            <em className="cs-dossier-email-kind">{email.status === "inferred" ? "Inferred" : "Observed"}</em>
          </button>
          {email.status === "inferred" && email.basis ? <small className="cs-dossier-email-basis">{email.basis}</small> : null}
        </div>
      ) : null}
      {dossier.channels.length > 0 ? (
        <p className="cs-dossier-channels">
          {dossier.channels.map((channel) => (
            <a
              className="cs-dossier-channel"
              href={channel.url}
              key={channel.label}
              rel="noreferrer"
              target="_blank"
            >
              {channel.label}
            </a>
          ))}
        </p>
      ) : null}
    </div>
  );
}

export function SharedTooltip({
  interaction,
  tooltip
}: {
  interaction?: TooltipInteraction;
  tooltip: SharedTooltipState | null;
}) {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const pinned = tooltip?.pinned ?? false;
  const dossier = tooltip ? asDossier(tooltip.body) : null;
  const interactive = dossier !== null;

  useEffect(() => {
    if (pinned && interactive) {
      nodeRef.current?.focus();
    }
  }, [pinned, interactive, tooltip?.id]);

  if (!tooltip) {
    return null;
  }

  return (
    <div
      className="cs-shared-tooltip"
      data-animate={tooltip.animate ? "true" : "false"}
      data-mode={tooltip.mode}
      data-pinned={pinned ? "true" : "false"}
      data-placement={tooltip.placement}
      data-variant={dossier ? "dossier" : "text"}
      id={SHARED_TOOLTIP_ID}
      onBlur={
        interactive && pinned
          ? (event) => {
              const nextTarget = event.relatedTarget;
              if (nextTarget instanceof Node && nodeRef.current?.contains(nextTarget)) {
                return;
              }
              interaction?.onFocusLeave();
            }
          : undefined
      }
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                interaction?.onDismiss();
              }
            }
          : undefined
      }
      onPointerEnter={interaction?.onPointerEnter}
      onPointerLeave={interaction?.onPointerLeave}
      ref={nodeRef}
      role="tooltip"
      style={{
        left: tooltip.left,
        maxHeight: tooltip.maxHeight,
        top: tooltip.top,
        width: tooltip.width
      }}
      tabIndex={interactive ? -1 : undefined}
    >
      {/* Keyed by id so a retarget remounts the content: the docked crossfade keyframe
          (company-arc.css) plays on mount, and a stray copy-acknowledgment state from the
          previous dossier never survives onto the next one. */}
      <div className="cs-shared-tooltip-content" key={tooltip.id}>
        <strong>{tooltip.title}</strong>
        {dossier ? <DossierBody dossier={dossier} /> : <span>{tooltip.body as string}</span>}
      </div>
    </div>
  );
}
