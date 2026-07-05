import { useRef, useState } from "react";
import type { FocusEvent, PointerEvent } from "react";

export type TooltipPlacement = "above" | "below";

// A structured person dossier. The visible people row keeps the identity and the email
// action; everything cited or contextual (the read, provenance, channels, email
// provenance) lives here. `read` is null when the evidence supports no honest claim.
export type TooltipDossier = {
  kind: "dossier";
  name: string;
  role: string | null;
  read: { text: string; citationIds: string[] } | null;
  provenance: string | null;
  email: { address: string; status: "observed" | "inferred" } | null;
  channels: Array<{ label: "GitHub" | "X" | "Site"; url: string }>;
};

type TooltipBody = string | TooltipDossier;

type SharedTooltipState = {
  animate: boolean;
  body: TooltipBody;
  id: string;
  left: number;
  placement: TooltipPlacement;
  title: string;
  top: number;
  width: number;
};

export type TooltipTriggerProps = {
  "aria-describedby": string;
  onBlur: (event: FocusEvent<HTMLElement>) => void;
  onFocus: (event: FocusEvent<HTMLElement>) => void;
  onPointerEnter: (event: PointerEvent<HTMLElement>) => void;
  onPointerLeave: (event: PointerEvent<HTMLElement>) => void;
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

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function asDossier(body: TooltipBody): TooltipDossier | null {
  return typeof body === "object" && body !== null && body.kind === "dossier" ? body : null;
}

export function useSharedTooltip(prefersReducedMotion: boolean) {
  const [tooltip, setTooltip] = useState<SharedTooltipState | null>(null);
  const previousTooltipId = useRef<string | null>(null);

  function showTooltip(input: {
    body: TooltipBody;
    id: string;
    placement?: TooltipPlacement;
    target: HTMLElement;
    title: string;
  }) {
    const rect = input.target.getBoundingClientRect();
    const width = Math.min(340, Math.max(240, window.innerWidth - 32));
    const left = clamp(rect.left + rect.width / 2 - width / 2, 16, Math.max(16, window.innerWidth - width - 16));
    const placement = input.placement ?? "above";
    const top = placement === "above" ? rect.top - 10 : rect.bottom + 10;
    const previousId = previousTooltipId.current;
    previousTooltipId.current = input.id;
    setTooltip({
      animate: Boolean(previousId && previousId !== input.id && !prefersReducedMotion),
      body: input.body,
      id: input.id,
      left,
      placement,
      title: input.title,
      top,
      width
    });
  }

  function hideTooltip() {
    setTooltip(null);
  }

  function triggerProps(input: {
    body: TooltipBody;
    id: string;
    placement?: TooltipPlacement;
    title: string;
  }): TooltipTriggerProps {
    return {
      "aria-describedby": SHARED_TOOLTIP_ID,
      onBlur: (event) => {
        const nextTarget = event.relatedTarget;
        if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
          return;
        }
        hideTooltip();
      },
      onFocus: (event) => showTooltip({ ...input, target: event.currentTarget }),
      onPointerEnter: (event) => showTooltip({ ...input, target: event.currentTarget }),
      onPointerLeave: () => hideTooltip()
    };
  }

  return { tooltip, triggerProps };
}

function DossierBody({ dossier }: { dossier: TooltipDossier }) {
  const role = dossier.role?.trim() || "Role not verified";

  return (
    <div className="cs-dossier" data-has-read={dossier.read ? "true" : "false"}>
      <p className="cs-dossier-role">{role}</p>
      {dossier.read ? <p className="cs-dossier-read">{dossier.read.text}</p> : null}
      {dossier.provenance ? <p className="cs-dossier-provenance">{dossier.provenance}</p> : null}
      {dossier.email ? (
        <p className="cs-dossier-email" data-email-status={dossier.email.status}>
          {dossier.email.address}
          <em className="cs-dossier-email-kind">
            {dossier.email.status === "inferred" ? "Inferred" : "Observed"}
          </em>
        </p>
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

export function SharedTooltip({ tooltip }: { tooltip: SharedTooltipState | null }) {
  if (!tooltip) {
    return null;
  }

  const dossier = asDossier(tooltip.body);

  return (
    <div
      className="cs-shared-tooltip"
      data-animate={tooltip.animate ? "true" : "false"}
      data-placement={tooltip.placement}
      data-variant={dossier ? "dossier" : "text"}
      id={SHARED_TOOLTIP_ID}
      role="tooltip"
      style={{
        left: tooltip.left,
        top: tooltip.top,
        width: tooltip.width
      }}
    >
      <strong>{tooltip.title}</strong>
      {dossier ? <DossierBody dossier={dossier} /> : <span>{tooltip.body as string}</span>}
    </div>
  );
}
