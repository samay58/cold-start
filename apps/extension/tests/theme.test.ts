import { describe, expect, it } from "vitest";
import { resolveTheme } from "../src/theme";

describe("resolveTheme precedence", () => {
  it("lets a manual dark preference win over everything", () => {
    expect(resolveTheme("dark", "off", false)).toEqual({ theme: "dark", reason: "manual" });
    expect(resolveTheme("dark", "unknown", false)).toEqual({ theme: "dark", reason: "manual" });
  });

  it("lets a manual light preference win over OS dark and Dark Reader", () => {
    expect(resolveTheme("light", "on", true)).toEqual({ theme: "light", reason: "manual" });
  });

  it("uses Dark Reader before OS when on auto", () => {
    expect(resolveTheme("auto", "on", false)).toEqual({ theme: "dark", reason: "dark-reader" });
  });

  it("falls to OS dark when auto and Dark Reader is off or unknown", () => {
    expect(resolveTheme("auto", "off", true)).toEqual({ theme: "dark", reason: "system" });
    expect(resolveTheme("auto", "unknown", true)).toEqual({ theme: "dark", reason: "system" });
  });

  it("treats unknown Dark Reader as no signal, never forcing light", () => {
    expect(resolveTheme("auto", "unknown", false)).toEqual({ theme: "light", reason: "default" });
  });

  it("defaults to light when auto with no dark signal", () => {
    expect(resolveTheme("auto", "off", false)).toEqual({ theme: "light", reason: "default" });
  });
});
