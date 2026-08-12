import { animate, useMotionValue, useMotionValueEvent } from "framer-motion";
import { useRef } from "react";
import type { AnimationPlaybackControls } from "framer-motion";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

// One full hold, in milliseconds. The linear fill and the fire decision share this number:
// the ink IS the countdown, so the release decision keys on elapsed hold time, never on
// animation frame progress (which test environments skip).
const HOLD_MS = 700;

// The hold-to-refile control: a seal ring beside the freshness mark that inks up over a
// 700ms press. Release at full fires the re-file once; an early release drains the ink back.
// The fill always animates, reduced motion included (essential progress feedback, per the
// motion doctrine); only the abandon drain softens to a fade. The component stays network-free:
// the panel owns the run, this object only reports hold intent through its callbacks.
export function RefileControl({
  disabled = false,
  disabledReason,
  onHoldAbandoned,
  onHoldStarted,
  onRefile,
  prefersReducedMotion
}: {
  disabled?: boolean | undefined;
  disabledReason?: string | null | undefined;
  onHoldAbandoned: () => void;
  onHoldStarted: () => void;
  onRefile: () => boolean;
  prefersReducedMotion: boolean;
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const progress = useMotionValue(0);
  const fillControls = useRef<AnimationPlaybackControls | null>(null);
  const pressLive = useRef(false);
  const holdStartedAt = useRef(0);

  useMotionValueEvent(progress, "change", (value) => {
    const button = buttonRef.current;
    if (!button) {
      return;
    }
    button.style.setProperty("--refile-progress", String(value));
    if (value >= 1) {
      button.setAttribute("data-full", "true");
    } else {
      button.removeAttribute("data-full");
    }
  });

  function startHold() {
    if (pressLive.current || disabled) {
      return;
    }
    pressLive.current = true;
    holdStartedAt.current = Date.now();
    onHoldStarted();
    fillControls.current?.stop();
    fillControls.current = animate(progress, 1, { duration: HOLD_MS / 1000, ease: "linear" });
  }

  function drainFill() {
    onHoldAbandoned();
    fillControls.current = animate(
      progress,
      0,
      prefersReducedMotion
        ? { duration: 0.15, ease: "easeOut" }
        : { type: "spring", stiffness: 300, damping: 30 }
    );
  }

  function releaseHold() {
    if (!pressLive.current) {
      return;
    }
    pressLive.current = false;
    fillControls.current?.stop();
    if (Date.now() - holdStartedAt.current >= HOLD_MS) {
      progress.set(0);
      onRefile();
      return;
    }
    drainFill();
  }

  function cancelHold() {
    if (!pressLive.current) {
      return;
    }
    pressLive.current = false;
    fillControls.current?.stop();
    drainFill();
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape") {
      cancelHold();
      return;
    }
    if (event.key !== " " && event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    if (event.repeat) {
      return;
    }
    startHold();
  }

  function handleKeyUp(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key !== " " && event.key !== "Enter") {
      return;
    }
    releaseHold();
  }

  return (
    <span className="cs-refile-wrap">
      <button
        aria-label="Re-file this profile. Hold to confirm."
        className="cs-refile"
        disabled={disabled}
        onBlur={cancelHold}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onPointerCancel={cancelHold}
        onPointerDown={startHold}
        onPointerLeave={cancelHold}
        onPointerUp={releaseHold}
        ref={buttonRef}
        type="button"
      >
        <span aria-hidden="true" className="cs-refile-ring">
          <span className="cs-refile-ring-frame" />
          <span className="cs-refile-ring-fill" />
        </span>
        <span className="cs-refile-word">Re-file</span>
      </button>
      {disabled && disabledReason ? <span className="cs-refile-reason">{disabledReason}</span> : null}
    </span>
  );
}
