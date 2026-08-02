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

  it("records a miss into the same tally invite/inspect uses", async () => {
    mocks.findAlphaInviteCardBySlug.mockResolvedValue(null);

    await expect(lookupAlphaInviteCardForSlug(db, "nobody")).resolves.toBeNull();
    expect(mocks.recordAlphaInviteAttempt).toHaveBeenCalledTimes(1);
  });

  it("returns null without a lookup once the breaker is open", async () => {
    mocks.countRecentAlphaInviteAttempts.mockResolvedValue(10);

    await expect(lookupAlphaInviteCardForSlug(db, "dad")).resolves.toBeNull();
    expect(mocks.findAlphaInviteCardBySlug).not.toHaveBeenCalled();
    expect(mocks.recordAlphaInviteAttempt).not.toHaveBeenCalled();
  });
});
