"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from "react";

// The card face's one interactive system: hover an inline [n] mark and its sources-rail row
// lights up; click to hold the pairing (so it survives the mouse moving on to read the row);
// Escape is the global breaker that always releases a hold, no matter what has focus. This is
// the only client module the card face needs; CardFace itself stays a server component and
// wraps its two-column contents in ChoreographyProvider, passing server-rendered children
// through the provider's children prop.

export type ChoreographyState = {
  hover: string | null;
  held: string | null;
};

export type ChoreographyAction =
  | { type: "hover"; id: string }
  | { type: "clearHover" }
  | { type: "toggleHeld"; id: string }
  | { type: "release" };

export const initialChoreographyState: ChoreographyState = { hover: null, held: null };

// Pure and exported standalone so the hover/hold/escape state machine is unit-testable without
// mounting React or touching the DOM (see tests/choreography.test.tsx).
export function choreographyReducer(state: ChoreographyState, action: ChoreographyAction): ChoreographyState {
  switch (action.type) {
    case "hover":
      return state.hover === action.id ? state : { ...state, hover: action.id };
    case "clearHover":
      return state.hover === null ? state : { ...state, hover: null };
    case "toggleHeld":
      // Clicking the already-held id releases it; clicking any other id moves the hold there.
      return { ...state, held: state.held === action.id ? null : action.id };
    case "release":
      return state.held === null ? state : { ...state, held: null };
    default:
      return state;
  }
}

type ChoreographyContextValue = ChoreographyState & {
  setHover: (id: string | null) => void;
  toggleHeld: (id: string) => void;
};

const ChoreographyContext = createContext<ChoreographyContextValue | null>(null);

function useChoreography(): ChoreographyContextValue {
  const context = useContext(ChoreographyContext);
  if (!context) {
    throw new Error("CiteMark and LedgerRow must render inside a ChoreographyProvider");
  }
  return context;
}

export function ChoreographyProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(choreographyReducer, initialChoreographyState);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        dispatch({ type: "release" });
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const setHover = useCallback((id: string | null) => {
    dispatch(id === null ? { type: "clearHover" } : { type: "hover", id });
  }, []);

  const toggleHeld = useCallback((id: string) => {
    dispatch({ type: "toggleHeld", id });
  }, []);

  const value = useMemo<ChoreographyContextValue>(
    () => ({ hover: state.hover, held: state.held, setHover, toggleHeld }),
    [state.hover, state.held, setHover, toggleHeld]
  );

  return <ChoreographyContext.Provider value={value}>{children}</ChoreographyContext.Provider>;
}

// Renders "[n]". Shared by StatStrip, SectionRows, and ConflictPanel: every inline citation
// reference on the card face is this one component, so the pairing highlight is consistent
// wherever a citation is cited more than once. data-cite-id stays on the rendered element
// deliberately: the gallery spec and prior tests target citation marks by that hook.
export function CiteMark({ id, number }: { id: string; number: number }) {
  const { hover, held, setHover, toggleHeld } = useChoreography();
  const on = hover === id || held === id;

  return (
    <span
      className="cs-face-cite"
      data-cite-id={id}
      data-on={on ? "true" : undefined}
      onClick={() => toggleHeld(id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          toggleHeld(id);
        }
      }}
      onMouseEnter={() => setHover(id)}
      onMouseLeave={() => setHover(null)}
      role="button"
      tabIndex={0}
    >
      [{number}]
    </span>
  );
}

// The sources rail's row wrapper. Display plus a link target, never a toggle itself: it has no
// onClick, so clicking a source title or anywhere else in the row cannot move or clear the hold
// set from a CiteMark elsewhere on the card.
export function LedgerRow({ id, children }: { id: string; children: React.ReactNode }) {
  const { hover, held } = useChoreography();
  const isHeld = held === id;
  const on = hover === id || isHeld;
  const dimmed = held !== null && !isHeld;

  return (
    <div
      className="cs-face-rail-row"
      data-dimmed={dimmed ? "true" : undefined}
      data-held={isHeld ? "true" : undefined}
      data-on={on ? "true" : undefined}
    >
      {children}
    </div>
  );
}
