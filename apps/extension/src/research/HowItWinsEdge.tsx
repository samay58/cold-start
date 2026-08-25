// The crown: the Lens plate's notched top edge, and the one surface where the How it wins read
// is legible without opening anything. At rest it is a label row, a hairline with a few notches
// and one bracket, and a sentence. The eighty ticks behind it (one per strategy) only appear
// under the pointer.
//
// Division of labour: how-it-wins-edge.ts owns geometry, targeting, spring physics, and the
// readout strings; this file owns the DOM, pointer and keyboard events, and the one animation
// frame loop. The loop writes the svg and the readout imperatively, so scrubbing eighty ticks
// never re-renders React; React state changes only when the current target or the pin changes,
// because only the note depends on those.
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent
} from "react";
import {
  EDGE_FALLBACK_WIDTH_PX,
  EDGE_HEIGHT_PX,
  EDGE_HOLLOW_DEPTH_PX,
  EDGE_QUESTION_DEPTH_PX,
  EDGE_MAGNIFICATION,
  EDGE_MARK_DEPTH_PX,
  EDGE_MARK_WIDTH_PX,
  EDGE_TOP_PX,
  crownAriaLabel,
  edgePositions,
  edgeTargets,
  magnification,
  nearestTickIndex,
  noteFor,
  readoutText,
  springAtRest,
  springStep,
  targetAt,
  targetsInKeyboardOrder,
  type EdgeTarget,
  type SpringState
} from "./how-it-wins-edge";
import type { HowItWinsDisplay } from "./investor-lens";
import { HOW_IT_WINS_COPY } from "./investor-read-copy";

// Arrival, once per read (see arrivedReads below): each mark drops in over 220ms, 40ms after
// the one to its left, and the bracket draws over the last 180ms of the 520ms.
const ARRIVAL_DELAY_MS = 300;
const ARRIVAL_MARK_STAGGER_MS = 40;
const ARRIVAL_MARK_MS = 220;
const ARRIVAL_BRACKET_MS = 180;
const ARRIVAL_TOTAL_MS = 520;

const SCALE_IN_MS = 140;
const SCALE_OUT_MS = 200;
const SCALE_LEAVE_DELAY_MS = 80; // so a pass across the plate does not flicker the scale
const MAX_FRAME_MS = 32;

const HOVER_WIDTH_GAIN_PX = 2; // 4px at rest, 6px under the cursor
const HOVER_DEPTH_GAIN_PX = 4;
const PINNED_DEPTH_PX = 2;
const TICK_BASE_PX = 3.5;
const TICK_GAIN_PX = 6;
const BRACKET_INSET_PX = 1;
const BRACKET_DROP_PX = 3;
const EDGE_RULE_BLEED_PX = 13; // the crown's horizontal padding, so the rule reaches the plate

// The svg is written as markup, so its class names live here rather than inline: CSS paints
// every stroke and fill, and the markup carries no colour.
const SVG_CLASS = {
  bracket: "cs-hiw-bracket",
  cutFill: "cs-hiw-cut-fill",
  cutWall: "cs-hiw-cut-wall",
  hollow: "cs-hiw-hollow",
  question: "cs-hiw-question",
  rule: "cs-hiw-rule",
  tick: "cs-hiw-tick"
} as const;

// One arrival per read, not per mount: a re-render, a scroll, or a category toggle must never
// replay it. A re-file changes the sentence or the strategies, which changes the key.
const arrivedReads = new Set<string>();

function readKey(display: HowItWinsDisplay): string {
  return [
    display.state,
    display.sentence ?? "",
    ...display.running.map((entry) => entry.id),
    ...display.next.map((entry) => entry.id),
    ...display.inQuestion.map((entry) => entry.id)
  ].join("|");
}

function sentenceFor(display: HowItWinsDisplay): string {
  if (display.state === "thin_file") return HOW_IT_WINS_COPY.thinFile;
  if (display.state === "nothing_stands_out") return display.sentence ?? HOW_IT_WINS_COPY.nothingStandsOut;
  return display.sentence ?? "";
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const easeOut = (value: number) => 1 - Math.pow(1 - value, 3);
const round = (value: number) => value.toFixed(2);
const flag = (value: boolean) => (value ? ` data-hot="true"` : "");
const pin = (value: boolean) => (value ? ` data-pinned="true"` : "");

function nearestTarget(targets: EdgeTarget[], x: number): EdgeTarget | null {
  let best: EdgeTarget | null = null;
  let bestDistance = Infinity;
  for (const target of targets) {
    const distance = Math.abs(target.x - x);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = target;
    }
  }
  return best;
}

export function HowItWinsEdge({
  display,
  prefersReducedMotion,
  onPin
}: {
  display: HowItWinsDisplay;
  prefersReducedMotion: boolean | null;
  onPin?: ((target: EdgeTarget | null) => void) | undefined;
}) {
  if (display.state === "not_read") {
    return null;
  }
  return <HowItWinsCrown display={display} onPin={onPin} prefersReducedMotion={prefersReducedMotion} />;
}

function HowItWinsCrown({
  display,
  prefersReducedMotion,
  onPin
}: {
  display: HowItWinsDisplay;
  prefersReducedMotion: boolean | null;
  onPin?: ((target: EdgeTarget | null) => void) | undefined;
}) {
  const uid = useId().replace(/:/g, "");
  const reduced = prefersReducedMotion === true;
  const arrivalKey = readKey(display);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const readoutRef = useRef<HTMLSpanElement | null>(null);
  const sentenceRef = useRef<HTMLParagraphElement | null>(null);
  const noteRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  const [width, setWidth] = useState(EDGE_FALLBACK_WIDTH_PX);
  const [pinned, setPinned] = useState(false);
  const [targetKey, setTargetKey] = useState<string | null>(null);
  const [noteKey, setNoteKey] = useState<string | null>(null);
  const [arrived, setArrived] = useState(() => arrivedReads.has(arrivalKey));

  const hoverXRef = useRef<number | null>(null);
  const cursorRef = useRef<number | null>(null);
  const springRef = useRef<SpringState | null>(null);
  const scaleRef = useRef(0);
  const tickRef = useRef<number | null>(null);
  const targetRef = useRef<EdgeTarget | null>(null);
  const targetKeyRef = useRef<string | null>(null);
  const pinnedRef = useRef(false);
  const leaveAtRef = useRef<number | null>(null);
  const releasingRef = useRef(false);
  const mountedRef = useRef(true);
  const lastFrameRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const frameRef = useRef<(now: number) => void>(() => undefined);
  const arriveStartRef = useRef<number | null>(null);
  const arriveElapsedRef = useRef<number | null>(arrivedReads.has(arrivalKey) || reduced ? null : 0);
  const arrivalKeyRef = useRef(arrivalKey);
  const pointerTypeRef = useRef<string>("mouse");

  // A re-file swaps the read under a live crown. Reset the arrival clock here, in render, not in
  // the effect below: the effect's 300ms timer would otherwise let the new marks paint at full
  // depth first and snap to zero when it fired.
  if (arrivalKeyRef.current !== arrivalKey) {
    arrivalKeyRef.current = arrivalKey;
    const replays = !arrivedReads.has(arrivalKey);
    arriveStartRef.current = null;
    arriveElapsedRef.current = replays && !reduced ? 0 : null;
    setArrived(!replays);
  }

  const xs = useMemo(() => edgePositions(width), [width]);
  const targets = useMemo(() => edgeTargets(display, xs), [display, xs]);
  const ordered = useMemo(() => targetsInKeyboardOrder(targets), [targets]);
  const sentence = sentenceFor(display);

  // Mark arrival runs left to right, so the stagger index is the mark's rank along the edge,
  // not its position in running[] or next[].
  const marks = useMemo(() => {
    const cuts = new Set<number>();
    const hollows = new Set<number>();
    const questions = new Set<number>();
    for (const target of targets) {
      if (target.kind === "running") cuts.add(target.index);
      if (target.kind === "next") hollows.add(target.index);
      if (target.kind === "in_question") questions.add(target.index);
    }
    const order = new Map<number, number>();
    [...cuts, ...hollows, ...questions].sort((a, b) => a - b).forEach((index, rank) => order.set(index, rank));
    return { cuts, hollows, questions, order };
  }, [targets]);

  // Both legs of the bracket take ink together, so the pair reads as one object.
  const pairIndexes = useMemo(() => {
    const legs = display.pair?.strategies ?? [];
    const indexes = new Set<number>();
    for (const target of targets) {
      if (target.kind === "running" && legs.some((leg) => leg === target.key)) indexes.add(target.index);
    }
    return indexes;
  }, [display, targets]);

  const draw = useCallback(() => {
    const svg = svgRef.current;
    const root = rootRef.current;
    if (!svg || !root) return;

    const cursor = cursorRef.current;
    const scale = scaleRef.current;
    const target = targetRef.current;
    const isPinned = pinnedRef.current;
    const elapsed = arriveElapsedRef.current;
    const markArrive = (index: number) => {
      if (elapsed === null) return 1;
      const rank = marks.order.get(index) ?? 0;
      return easeOut(clamp01((elapsed - rank * ARRIVAL_MARK_STAGGER_MS) / ARRIVAL_MARK_MS));
    };

    const parts: string[] = [
      `<rect class="${SVG_CLASS.rule}" x="${-EDGE_RULE_BLEED_PX}" y="${EDGE_TOP_PX}" width="${round(width + EDGE_RULE_BLEED_PX * 2)}" height="1"/>`
    ];

    for (let index = 0; index < xs.length; index += 1) {
      const x = xs[index] ?? 0;
      const distance = cursor === null ? Infinity : Math.abs(cursor - x);
      const mag = cursor === null ? 0 : scale * ((magnification(distance) - 1) / EDGE_MAGNIFICATION);
      const hot = target !== null && (target.index === index || (target.kind === "pair" && pairIndexes.has(index)));
      const held = isPinned && hot;
      const isCut = marks.cuts.has(index);
      const isHollow = marks.hollows.has(index);
      const isQuestion = marks.questions.has(index);

      if (isCut || isHollow || isQuestion) {
        const base = isCut ? EDGE_MARK_DEPTH_PX : isHollow ? EDGE_HOLLOW_DEPTH_PX : EDGE_QUESTION_DEPTH_PX;
        const depth = (base + HOVER_DEPTH_GAIN_PX * mag + (held ? PINNED_DEPTH_PX : 0)) * markArrive(index);
        const wide = EDGE_MARK_WIDTH_PX + HOVER_WIDTH_GAIN_PX * mag;
        const left = round(x - wide / 2);
        const right = round(x + wide / 2);
        const floor = round(EDGE_TOP_PX + depth);
        if (isCut) {
          parts.push(
            `<rect class="${SVG_CLASS.cutFill}" x="${left}" y="${EDGE_TOP_PX - 1}" width="${round(wide)}" height="${round(depth + 1)}"/>`,
            `<path class="${SVG_CLASS.cutWall}" d="M ${left} ${EDGE_TOP_PX} V ${floor} H ${right} V ${EDGE_TOP_PX}"${flag(hot)}${pin(held)}/>`
          );
        } else {
          parts.push(
            `<path class="${isHollow ? SVG_CLASS.hollow : SVG_CLASS.question}" d="M ${left} ${EDGE_TOP_PX} V ${floor} H ${right} V ${EDGE_TOP_PX}"${flag(hot)}${pin(held)}/>`
          );
        }
        continue;
      }

      // The scale of 80: invisible at rest, magnified under the cursor, ink on the nearest tick.
      const alpha = Math.min(1, scale) * (0.55 + 0.45 * mag);
      if (alpha <= 0.01) continue;
      const height = TICK_BASE_PX + TICK_GAIN_PX * mag;
      parts.push(
        `<rect class="${SVG_CLASS.tick}" x="${round(x - 0.5)}" y="${EDGE_TOP_PX + 1}" width="1" height="${round(height)}" opacity="${alpha.toFixed(2)}"${flag(tickRef.current === index)}/>`
      );
    }

    const pair = targets.find((candidate) => candidate.kind === "pair");
    if (pair?.span) {
      const [left, right] = pair.span;
      const y = EDGE_TOP_PX + EDGE_MARK_DEPTH_PX;
      const held = isPinned && target?.kind === "pair";
      // pathLength normalizes the draw-on, so one dashoffset works at any plate width.
      const drawn = elapsed === null ? 1 : clamp01((elapsed - (ARRIVAL_TOTAL_MS - ARRIVAL_BRACKET_MS)) / ARRIVAL_BRACKET_MS);
      parts.push(
        `<path class="${SVG_CLASS.bracket}" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${(1 - drawn).toFixed(3)}" d="M ${round(left)} ${round(y + BRACKET_INSET_PX)} V ${round(y + BRACKET_INSET_PX + BRACKET_DROP_PX)} H ${round(right)} V ${round(y + BRACKET_INSET_PX)}"${flag(target?.kind === "pair")}${pin(held)}/>`
      );
    }

    svg.innerHTML = parts.join("");
    root.dataset.hover = hoverXRef.current === null ? "false" : "true";

    const readout = readoutRef.current;
    if (readout) {
      const { text, ink } = readoutText(display, tickRef.current, target);
      if (readout.textContent !== text) readout.textContent = text;
      readout.dataset.ink = ink ? "true" : "false";
    }
  }, [display, marks, pairIndexes, targets, width, xs]);

  const syncState = useCallback(() => {
    const key = targetRef.current?.key ?? null;
    if (key === targetKeyRef.current) return;
    targetKeyRef.current = key;
    setTargetKey(key);
    if (key !== null) setNoteKey(key);
  }, []);

  const retarget = useCallback(() => {
    // While a release fades out with no pointer on the crown, the cursor stays parked so the
    // marks can settle, but the readout must already be back at the rest count: re-acquiring
    // the target under the parked cursor would re-open the note nobody asked for.
    if (pinnedRef.current || releasingRef.current) return;
    const cursor = cursorRef.current;
    if (cursor === null) {
      tickRef.current = null;
      targetRef.current = null;
      return;
    }
    tickRef.current = nearestTickIndex(xs, cursor);
    targetRef.current = targetAt(targets, display, xs, cursor);
  }, [display, targets, xs]);

  const schedule = useCallback(() => {
    if (reduced || rafRef.current !== null || !mountedRef.current) return;
    rafRef.current = requestAnimationFrame((now) => frameRef.current(now));
  }, [reduced]);

  const runFrame = useCallback((now: number) => {
    rafRef.current = null;
    if (!mountedRef.current) return;
    const last = lastFrameRef.current;
    lastFrameRef.current = now;
    const dt = last === null ? 16 : Math.min(MAX_FRAME_MS, now - last);
    let busy = false;

    if (arriveStartRef.current !== null) {
      const elapsed = now - arriveStartRef.current;
      if (elapsed >= ARRIVAL_TOTAL_MS) {
        arriveStartRef.current = null;
        arriveElapsedRef.current = null;
      } else {
        arriveElapsedRef.current = elapsed;
        busy = true;
      }
    }

    const want = hoverXRef.current !== null || pinnedRef.current ? 1 : 0;
    if (scaleRef.current !== want) {
      if (want === 1) {
        scaleRef.current = Math.min(1, scaleRef.current + dt / SCALE_IN_MS);
      } else {
        const leftAt = leaveAtRef.current;
        if (leftAt !== null && now - leftAt >= SCALE_LEAVE_DELAY_MS) {
          scaleRef.current = Math.max(0, scaleRef.current - dt / SCALE_OUT_MS);
        }
      }
      busy = busy || scaleRef.current !== want;
    }

    const hover = hoverXRef.current;
    if (hover !== null) {
      const state = springRef.current ?? { x: hover, v: 0 };
      const next = springStep(state, hover, dt / 1000);
      if (springAtRest(next, hover)) {
        springRef.current = { x: hover, v: 0 };
        cursorRef.current = hover;
      } else {
        springRef.current = next;
        cursorRef.current = next.x;
        busy = true;
      }
    } else if (scaleRef.current === 0) {
      springRef.current = null;
      cursorRef.current = null;
      tickRef.current = null;
      releasingRef.current = false;
    }

    retarget();
    draw();
    syncState();
    if (busy) schedule();
  }, [draw, retarget, schedule, syncState]);

  // The loop calls the frame body through a ref so a re-render can swap it without cancelling an
  // in-flight frame. Layout effect rather than render or a passive effect: it has to be current
  // before the next animation frame runs.
  useLayoutEffect(() => {
    frameRef.current = runFrame;
  }, [runFrame]);

  const release = useCallback(() => {
    const wasPinned = pinnedRef.current;
    pinnedRef.current = false;
    setPinned(false);
    targetRef.current = null;
    if (hoverXRef.current === null) {
      releasingRef.current = true;
      tickRef.current = null;
      leaveAtRef.current = reduced ? null : performance.now();
      if (reduced) {
        scaleRef.current = 0;
        cursorRef.current = null;
        springRef.current = null;
      }
    }
    retarget();
    draw();
    syncState();
    if (!reduced) schedule();
    if (wasPinned) onPin?.(null);
  }, [draw, onPin, reduced, retarget, schedule, syncState]);

  const pinTo = useCallback(
    (target: EdgeTarget) => {
      pinnedRef.current = true;
      setPinned(true);
      targetRef.current = target;
      tickRef.current = target.index;
      cursorRef.current = target.x;
      springRef.current = { x: target.x, v: 0 };
      hoverXRef.current = null;
      leaveAtRef.current = null;
      releasingRef.current = false;
      scaleRef.current = 1; // keyboard and touch park the cursor; no spring travel to watch
      draw();
      syncState();
      onPin?.(target);
    },
    [draw, onPin, syncState]
  );

  const localX = useCallback(
    (clientX: number) => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      if (rect.width === 0) return null;
      return (clientX - rect.left) * (width / rect.width);
    },
    [width]
  );

  const insideNote = (node: EventTarget | null) => node instanceof Node && noteRef.current?.contains(node) === true;
  const insideList = (node: EventTarget | null) => node instanceof Node && listRef.current?.contains(node) === true;
  const insideSentence = (node: EventTarget | null) => node instanceof Node && sentenceRef.current?.contains(node) === true;

  // The target under a pointer event's own x, which is what a click means even when the spring
  // has not finished travelling there yet.
  const targetFromClient = useCallback(
    (clientX: number, node: EventTarget | null) => {
      const onSentence = node instanceof Node && sentenceRef.current?.contains(node) === true;
      if (onSentence) return targets.find((target) => target.kind === "pair") ?? null;
      const x = localX(clientX);
      return x === null ? null : targetAt(targets, display, xs, x);
    },
    [display, localX, targets, xs]
  );

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    pointerTypeRef.current = event.pointerType;
    if (targets.length === 0 || event.pointerType === "touch" || pinnedRef.current) return;
    if (insideNote(event.target)) return;

    if (insideSentence(event.target)) {
      const pair = targets.find((target) => target.kind === "pair");
      if (!pair) return;
      hoverXRef.current = pair.x;
    } else {
      const x = localX(event.clientX);
      if (x === null) return;
      hoverXRef.current = x;
    }
    leaveAtRef.current = null;
    releasingRef.current = false;

    if (reduced) {
      // No spring travel and no easing: the nearest tick, the readout, and the scale all snap.
      cursorRef.current = hoverXRef.current;
      springRef.current = { x: hoverXRef.current ?? 0, v: 0 };
      scaleRef.current = 1;
      retarget();
      draw();
      syncState();
      return;
    }
    schedule();
  }

  function handlePointerLeave() {
    if (hoverXRef.current === null) return;
    hoverXRef.current = null;
    leaveAtRef.current = reduced ? null : performance.now();
    if (reduced) {
      if (!pinnedRef.current) {
        scaleRef.current = 0;
        cursorRef.current = null;
        springRef.current = null;
        tickRef.current = null;
      }
      retarget();
      draw();
      syncState();
      return;
    }
    schedule();
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    pointerTypeRef.current = event.pointerType;
    if (event.pointerType !== "touch" || targets.length === 0) return;
    if (insideNote(event.target) || insideList(event.target)) return;

    // A tap snaps: the nearest target wins even when the finger lands between marks.
    let next = targetFromClient(event.clientX, event.target);
    if (!next && !insideSentence(event.target)) {
      const x = localX(event.clientX);
      if (x !== null) next = nearestTarget(targets, x);
    }
    if (!next) return;
    if (pinnedRef.current && targetRef.current?.key === next.key) {
      release();
      return;
    }
    pinTo(next);
  }

  function handleClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (pointerTypeRef.current === "touch") return;
    if (targets.length === 0 || insideNote(event.target) || insideList(event.target)) return;
    if (pinnedRef.current) {
      release();
      return;
    }
    const target = targetRef.current ?? targetFromClient(event.clientX, event.target);
    if (target) pinTo(target);
  }

  // The hidden buttons render in `ordered` order, so a key pressed on one of them names its own
  // target: a screen-reader user is on a button, not on a cursor.
  const focusedTargetIndex = useCallback((node: EventTarget | null) => {
    const list = listRef.current;
    if (!list || !(node instanceof Element)) return null;
    const button = node.closest("button");
    if (!button || !list.contains(button)) return null;
    const index = [...list.querySelectorAll("button")].indexOf(button);
    return index < 0 ? null : index;
  }, []);

  const focusTargetButton = useCallback((index: number) => {
    const buttons = listRef.current?.querySelectorAll("button");
    buttons?.[index]?.focus();
  }, []);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (ordered.length === 0) return;
    const fromButton = focusedTargetIndex(event.target);

    if (event.key === "Escape") {
      if (!pinnedRef.current && targetRef.current === null) return;
      event.preventDefault();
      release();
      return;
    }

    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const current = fromButton ?? ordered.findIndex((target) => target.key === targetRef.current?.key);
      const next = event.key === "ArrowRight"
        ? Math.min(ordered.length - 1, current + 1)
        : Math.max(0, current - 1);
      const target = ordered[next];
      if (!target) return;
      pinTo(target);
      // Focus follows the walk, so the name the reader hears is the strategy now pinned.
      if (fromButton !== null) focusTargetButton(next);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      // preventDefault also cancels the button's native activation, so the pin toggles once.
      event.preventDefault();
      const target = fromButton === null ? targetRef.current ?? ordered[0] : ordered[fromButton];
      if (!target) return;
      if (pinnedRef.current && (fromButton === null || targetRef.current?.key === target.key)) {
        release();
        return;
      }
      pinTo(target);
    }
  }

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver((entries) => {
      const measured = entries[0]?.contentRect.width ?? 0;
      setWidth(measured > 0 ? measured : EDGE_FALLBACK_WIDTH_PX);
    });
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  // The read key, not the display object, is the dependency: the parent rebuilds the display on
  // every render, and an effect that re-ran on it would cancel its own pending arrival and then
  // find the key already marked arrived, which is how the marks ended up permanently at depth 0.
  useEffect(() => {
    if (arrivedReads.has(arrivalKey)) return undefined;
    if (reduced) {
      const fade = setTimeout(() => {
        arrivedReads.add(arrivalKey);
        setArrived(true);
      }, 0);
      return () => clearTimeout(fade);
    }
    const start = setTimeout(() => {
      arrivedReads.add(arrivalKey);
      arriveStartRef.current = performance.now();
      arriveElapsedRef.current = 0;
      setArrived(true);
      schedule();
    }, ARRIVAL_DELAY_MS);
    return () => clearTimeout(start);
  }, [arrivalKey, reduced, schedule]);

  // Every render redraws once, so a React update can never leave the svg or the readout stale.
  useLayoutEffect(() => {
    draw();
  });

  useEffect(() => () => {
    mountedRef.current = false;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  const noteTarget = noteKey === null ? null : targets.find((target) => target.key === noteKey) ?? null;
  const note = noteTarget ? noteFor(display, noteTarget) : null;
  const noteOpen = noteTarget !== null && targetKey === noteTarget.key;

  return (
    <div
      aria-label={crownAriaLabel(display)}
      className="cs-how-it-wins"
      data-arrived={arrived ? "true" : "false"}
      data-pinned={pinned ? "true" : "false"}
      data-reduced-motion={reduced ? "true" : "false"}
      data-state={display.state}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onPointerLeave={handlePointerLeave}
      onPointerMove={handlePointerMove}
      ref={rootRef}
      role="group"
      tabIndex={0}
    >
      <div className="cs-how-it-wins-label">
        <b>{HOW_IT_WINS_COPY.label}</b>
        <span aria-live="polite" className="cs-how-it-wins-readout" ref={readoutRef} />
      </div>
      <div className="cs-how-it-wins-edge">
        <svg aria-hidden="true" ref={svgRef} viewBox={`0 0 ${width} ${EDGE_HEIGHT_PX}`} />
      </div>
      <p className="cs-how-it-wins-sentence" ref={sentenceRef}>{sentence}</p>
      {ordered.length > 0 ? (
        <ul className="cs-how-it-wins-targets sr-only" ref={listRef}>
          {ordered.map((target) => {
            const entry = noteFor(display, target);
            const described = `${uid}-${target.key}`;
            return (
              <li key={target.key}>
                <button
                  aria-describedby={described}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (pinnedRef.current && targetRef.current?.key === target.key) release();
                    else pinTo(target);
                  }}
                  type="button"
                >
                  {readoutText(display, target.index, target).text}
                </button>
                <span id={described}>
                  {[entry.meaning, entry.body, entry.wrongIf ? `${HOW_IT_WINS_COPY.wrongIf} ${entry.wrongIf}` : null]
                    .filter((line): line is string => Boolean(line))
                    .join(" ")}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
      {noteTarget && note ? (
        <div
          aria-label={note.kicker}
          className="cs-how-it-wins-note"
          data-open={noteOpen ? "true" : "false"}
          data-placement="below"
          ref={noteRef}
          role="dialog"
          style={{ "--cs-hiw-anchor": `${noteTarget.x + EDGE_RULE_BLEED_PX}px` } as CSSProperties}
        >
          <div className="cs-how-it-wins-note-content" key={noteTarget.key}>
            <div className="cs-how-it-wins-kicker">
              <span>
                <b>{note.kicker}.</b>
                {note.meaning ? ` ${note.meaning}` : null}
              </span>
              {pinned ? <small>{HOW_IT_WINS_COPY.pinned}</small> : null}
            </div>
            <p>{note.body}</p>
            {note.wrongIf ? (
              <div className="cs-how-it-wins-meta">
                <em>{HOW_IT_WINS_COPY.wrongIf}</em> {note.wrongIf}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
