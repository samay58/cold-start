// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { darkReaderSignalFromProbe, detectDarkReader } from "../src/dark-reader-bridge";

function resetRoot() {
  const root = document.documentElement;
  root.removeAttribute("data-darkreader-mode");
  root.removeAttribute("data-darkreader-scheme");
  document.head.innerHTML = "";
}

afterEach(resetRoot);

describe("detectDarkReader", () => {
  it("reports high-confidence on for a dark scheme", () => {
    document.documentElement.setAttribute("data-darkreader-mode", "dynamic");
    document.documentElement.setAttribute("data-darkreader-scheme", "dark");
    expect(detectDarkReader()).toEqual({ state: "on", confidence: "high" });
  });

  it("treats the dimmed scheme as on", () => {
    document.documentElement.setAttribute("data-darkreader-mode", "dynamic");
    document.documentElement.setAttribute("data-darkreader-scheme", "dimmed");
    expect(detectDarkReader().state).toBe("on");
  });

  it("falls back to medium confidence on injected style markers", () => {
    const style = document.createElement("style");
    style.className = "darkreader darkreader--sync";
    document.head.appendChild(style);
    expect(detectDarkReader()).toEqual({ state: "on", confidence: "medium" });
  });

  it("reports off with no markers", () => {
    expect(detectDarkReader().state).toBe("off");
  });

  it("treats a darkreader-lock as off even with a dark scheme", () => {
    document.documentElement.setAttribute("data-darkreader-mode", "dynamic");
    document.documentElement.setAttribute("data-darkreader-scheme", "dark");
    const lock = document.createElement("meta");
    lock.setAttribute("name", "darkreader-lock");
    document.head.appendChild(lock);
    expect(detectDarkReader().state).toBe("off");
  });
});

describe("darkReaderSignalFromProbe", () => {
  it("passes through on and off", () => {
    expect(darkReaderSignalFromProbe({ state: "on", confidence: "high" })).toBe("on");
    expect(darkReaderSignalFromProbe({ state: "off", confidence: "medium" })).toBe("off");
  });

  it("maps a missing probe to unknown", () => {
    expect(darkReaderSignalFromProbe(undefined)).toBe("unknown");
    expect(darkReaderSignalFromProbe(null)).toBe("unknown");
  });
});
