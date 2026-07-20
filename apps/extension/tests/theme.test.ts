import { describe, expect, it } from "vitest";
import { resolveTheme } from "../src/shared/theme";

describe("resolveTheme precedence", () => {
  it("lets a manual dark preference win over OS light", () => {
    expect(resolveTheme("dark", false)).toEqual({ theme: "dark", reason: "manual" });
  });

  it("lets a manual light preference win over OS dark", () => {
    expect(resolveTheme("light", true)).toEqual({ theme: "light", reason: "manual" });
  });

  it("follows OS dark when on auto", () => {
    expect(resolveTheme("auto", true)).toEqual({ theme: "dark", reason: "system" });
  });

  it("defaults to light when auto and OS is light", () => {
    expect(resolveTheme("auto", false)).toEqual({ theme: "light", reason: "default" });
  });
});
