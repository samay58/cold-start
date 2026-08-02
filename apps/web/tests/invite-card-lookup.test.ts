import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  countRecentAlphaInviteAttempts: vi.fn(),
  findAlphaInviteCardBySlug: vi.fn(),
  recordAlphaInviteAttempt: vi.fn()
}));

vi.mock("@cold-start/db", () => ({
  countRecentAlphaInviteAttempts: mocks.countRecentAlphaInviteAttempts,
  findAlphaInviteCardBySlug: mocks.findAlphaInviteCardBySlug,
  recordAlphaInviteAttempt: mocks.recordAlphaInviteAttempt
}));

const { lookupAlphaInviteCardForSlug } = await import("../src/app/i/[slug]/invite-card-lookup");

const db = {} as never;

describe("lookupAlphaInviteCardForSlug", () => {
  beforeEach(() => {
    mocks.countRecentAlphaInviteAttempts.mockReset();
    mocks.countRecentAlphaInviteAttempts.mockResolvedValue(0);
    mocks.findAlphaInviteCardBySlug.mockReset();
    mocks.recordAlphaInviteAttempt.mockReset();
  });

  it("returns the card on a hit and never touches the breaker tally", async () => {
    const card = { displayName: "Dad", ordinal: 4, cardPngBase64: "abc" };
    mocks.findAlphaInviteCardBySlug.mockResolvedValue(card);

    await expect(lookupAlphaInviteCardForSlug(db, "dad")).resolves.toEqual(card);
    expect(mocks.recordAlphaInviteAttempt).not.toHaveBeenCalled();
  });

  it("keeps a page miss out of the token breaker tally", async () => {
    mocks.findAlphaInviteCardBySlug.mockResolvedValue(null);

    await expect(lookupAlphaInviteCardForSlug(db, "nobody")).resolves.toBeNull();
    expect(mocks.countRecentAlphaInviteAttempts).not.toHaveBeenCalled();
    expect(mocks.recordAlphaInviteAttempt).not.toHaveBeenCalled();
  });

  it("still resolves a real page while the token breaker is open", async () => {
    const card = { displayName: "Dad", ordinal: 4, cardPngBase64: "abc" };
    mocks.countRecentAlphaInviteAttempts.mockResolvedValue(10);
    mocks.findAlphaInviteCardBySlug.mockResolvedValue(card);

    await expect(lookupAlphaInviteCardForSlug(db, "dad")).resolves.toEqual(card);
    expect(mocks.findAlphaInviteCardBySlug).toHaveBeenCalledWith(db, "dad");
    expect(mocks.countRecentAlphaInviteAttempts).not.toHaveBeenCalled();
    expect(mocks.recordAlphaInviteAttempt).not.toHaveBeenCalled();
  });
});
