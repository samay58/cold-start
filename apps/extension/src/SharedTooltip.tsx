import { useRef, useState } from "react";
import type { FocusEvent, PointerEvent } from "react";

export type TooltipPlacement = "above" | "below";

type SharedTooltipState = {
  animate: boolean;
  body: string;
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

export type TooltipTriggerPropsFor = (input: {
  body: string;
  id: string;
  placement?: TooltipPlacement;
  title: string;
}) => TooltipTriggerProps;

export const SHARED_TOOLTIP_ID = "cs-company-shared-tooltip";

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function useSharedTooltip(prefersReducedMotion: boolean) {
  const [tooltip, setTooltip] = useState<SharedTooltipState | null>(null);
  const previousTooltipId = useRef<string | null>(null);

  function showTooltip(input: {
    body: string;
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
    body: string;
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

export function SharedTooltip({ tooltip }: { tooltip: SharedTooltipState | null }) {
  if (!tooltip) {
    return null;
  }

  return (
    <div
      className="cs-shared-tooltip"
      data-animate={tooltip.animate ? "true" : "false"}
      data-placement={tooltip.placement}
      id={SHARED_TOOLTIP_ID}
      role="tooltip"
      style={{
        left: tooltip.left,
        top: tooltip.top,
        width: tooltip.width
      }}
    >
      <strong>{tooltip.title}</strong>
      <span>{tooltip.body}</span>
    </div>
  );
}
