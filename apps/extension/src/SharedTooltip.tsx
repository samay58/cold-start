import { useEffect, useRef, useState } from "react";
import type { FocusEvent, KeyboardEvent, PointerEvent } from "react";

export type TooltipPlacement = "above" | "below";

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
  // True only when the dossier is pinned open by keyboard: focus lives inside it and it
  // ignores pointer-leave until Escape or a focus-out hands control back to the row.
  pinned: boolean;
  placement: TooltipPlacement;
  title: string;
  top: number;
  width: number;
};

export type TooltipTriggerProps = {
  "aria-describedby": string;
  onBlur: (event: FocusEvent<HTMLElement>) => void;
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
  placement?: TooltipPlacement;
  title: string;
}) => TooltipTriggerProps;

const SHARED_TOOLTIP_ID = "cs-company-shared-tooltip";

// Grace window between leaving the trigger and reaching the tooltip. Long enough to bridge
// the 10px gap without the tooltip vanishing, short enough to still feel immediate. Applies
// to every tooltip variant.
const HIDE_GRACE_MS = 160;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function asDossier(body: TooltipBody): TooltipDossier | null {
  return typeof body === "object" && body !== null && body.kind === "dossier" ? body : null;
}

export function useSharedTooltip(prefersReducedMotion: boolean) {
  const [tooltip, setTooltip] = useState<SharedTooltipState | null>(null);
  const previousTooltipId = useRef<string | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinnedRef = useRef(false);
  const triggerRef = useRef<HTMLElement | null>(null);

  function clearHideTimer() {
    if (hideTimer.current !== null) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }

  function commitTooltip(
    input: { body: TooltipBody; id: string; placement?: TooltipPlacement; title: string },
    target: HTMLElement,
    pinned: boolean
  ) {
    clearHideTimer();
    const rect = target.getBoundingClientRect();
    const width = Math.min(340, Math.max(240, window.innerWidth - 32));
    const left = clamp(rect.left + rect.width / 2 - width / 2, 16, Math.max(16, window.innerWidth - width - 16));
    const placement = input.placement ?? "above";
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
    const previousId = previousTooltipId.current;
    previousTooltipId.current = input.id;
    pinnedRef.current = pinned;
    setTooltip({
      animate: Boolean(previousId && previousId !== input.id && !prefersReducedMotion),
      body: input.body,
      id: input.id,
      left,
      maxHeight,
      pinned,
      placement,
      title: input.title,
      top,
      width
    });
  }

  function hideTooltip() {
    clearHideTimer();
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

  function triggerProps(input: {
    body: TooltipBody;
    id: string;
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
      onFocus: (event) => commitTooltip(input, event.currentTarget, false),
      onKeyDown: (event) => {
        if (!interactive) {
          return;
        }
        if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
          event.preventDefault();
          triggerRef.current = event.currentTarget;
          commitTooltip(input, event.currentTarget, true);
        }
      },
      onPointerEnter: (event) => commitTooltip(input, event.currentTarget, false),
      onPointerLeave: () => {
        if (pinnedRef.current) {
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

  return { hideTooltip, tooltip, triggerProps, tooltipInteraction };
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
    if (!email) {
      return;
    }
    try {
      await navigator.clipboard?.writeText(email.address);
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
      <strong>{tooltip.title}</strong>
      {dossier ? <DossierBody dossier={dossier} /> : <span>{tooltip.body as string}</span>}
    </div>
  );
}
