// The card face's hover/hold/escape state machine, tested as a pure reducer: no React mount, no
// DOM, no jsdom. choreography.tsx exports choreographyReducer standalone for exactly this reason.
import { describe, expect, it } from "vitest";
import { choreographyReducer, initialChoreographyState, type ChoreographyState } from "../src/components/card/choreography";

describe("choreographyReducer", () => {
  it("sets hover to the hovered id", () => {
    const next = choreographyReducer(initialChoreographyState, { type: "hover", id: "c1" });

    expect(next).toEqual({ hover: "c1", held: null });
  });

  it("clears hover back to null", () => {
    const hovering: ChoreographyState = { hover: "c1", held: null };

    const next = choreographyReducer(hovering, { type: "clearHover" });

    expect(next).toEqual({ hover: null, held: null });
  });

  it("clearing hover that is already null returns the same state (no re-render)", () => {
    const next = choreographyReducer(initialChoreographyState, { type: "clearHover" });

    expect(next).toBe(initialChoreographyState);
  });

  it("holds a mark that was not previously held", () => {
    const next = choreographyReducer(initialChoreographyState, { type: "toggleHeld", id: "c1" });

    expect(next).toEqual({ hover: null, held: "c1" });
  });

  it("releases the held mark when it is toggled a second time", () => {
    const held: ChoreographyState = { hover: null, held: "c1" };

    const next = choreographyReducer(held, { type: "toggleHeld", id: "c1" });

    expect(next).toEqual({ hover: null, held: null });
  });

  it("moves the hold straight to a new id when a different mark is toggled while one is held", () => {
    const held: ChoreographyState = { hover: null, held: "c1" };

    const next = choreographyReducer(held, { type: "toggleHeld", id: "c2" });

    expect(next).toEqual({ hover: null, held: "c2" });
  });

  it("leaves hover untouched when a hold toggles", () => {
    const state: ChoreographyState = { hover: "c3", held: "c1" };

    const next = choreographyReducer(state, { type: "toggleHeld", id: "c2" });

    expect(next).toEqual({ hover: "c3", held: "c2" });
  });

  it("releases the hold on escape", () => {
    const held: ChoreographyState = { hover: "c1", held: "c1" };

    const next = choreographyReducer(held, { type: "release" });

    expect(next).toEqual({ hover: "c1", held: null });
  });

  it("releasing when nothing is held returns the same state (no re-render)", () => {
    const next = choreographyReducer(initialChoreographyState, { type: "release" });

    expect(next).toBe(initialChoreographyState);
  });
});
