import { describe, expect, it } from "vitest";
import {
  ALPHA_INVITE_BREAKER_THRESHOLD,
  ALPHA_INVITE_BREAKER_WINDOW_MS,
  INVITE_TOKEN_PATTERN,
  INVITE_WORDLIST,
  generateInviteCode
} from "../src/invite-codes";

describe("INVITE_WORDLIST", () => {
  it("holds at least 1024 words of 4-9 lowercase letters", () => {
    expect(INVITE_WORDLIST.length).toBeGreaterThanOrEqual(1024);
    for (const word of INVITE_WORDLIST) {
      expect(word).toMatch(/^[a-z]{4,9}$/);
    }
  });

  it("is prefix-free: no word is a prefix of another", () => {
    const sorted = [...INVITE_WORDLIST].sort();
    for (let i = 1; i < sorted.length; i += 1) {
      const word = sorted[i] ?? "";
      const previous = sorted[i - 1] ?? "";
      expect(word.startsWith(previous)).toBe(false);
    }
  });
});

describe("generateInviteCode", () => {
  it("returns three distinct wordlist words joined by hyphens", () => {
    for (let i = 0; i < 200; i += 1) {
      const code = generateInviteCode();
      const words = code.split("-");
      expect(words).toHaveLength(3);
      expect(new Set(words).size).toBe(3);
      for (const word of words) {
        expect(INVITE_WORDLIST).toContain(word);
      }
      expect(code).toMatch(INVITE_TOKEN_PATTERN);
    }
  });
});

describe("INVITE_TOKEN_PATTERN", () => {
  it("accepts legacy 43-char base64url tokens", () => {
    expect("Xk3jP9qLm2vR8tYw4nZbF6hD1cAeG7sUoI5xKdMpQrE").toMatch(INVITE_TOKEN_PATTERN);
  });
  it("accepts word codes and rejects short garbage", () => {
    expect("ember-quarto-lark").toMatch(INVITE_TOKEN_PATTERN);
    expect("too-short").not.toMatch(INVITE_TOKEN_PATTERN);
    expect("has spaces in it here").not.toMatch(INVITE_TOKEN_PATTERN);
  });
});

describe("invite breaker contract", () => {
  it("keeps one window and threshold for runtime and operator reporting", () => {
    expect(ALPHA_INVITE_BREAKER_WINDOW_MS).toBe(60 * 60 * 1_000);
    expect(ALPHA_INVITE_BREAKER_THRESHOLD).toBe(10);
  });
});
