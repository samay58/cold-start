import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findActiveAlphaInviteCardByPresentationTokenHash: vi.fn()
}));

vi.mock("@cold-start/db", () => ({
  findActiveAlphaInviteCardByPresentationTokenHash: mocks.findActiveAlphaInviteCardByPresentationTokenHash
}));

const { lookupAlphaInviteCardForPresentation } = await import("../src/app/i/[slug]/invite-card-lookup");

const db = {} as never;
const token = "p".repeat(43);

describe("lookupAlphaInviteCardForPresentation", () => {
  beforeEach(() => {
    mocks.findActiveAlphaInviteCardByPresentationTokenHash.mockReset();
  });

  it("hashes the opaque capability before the protected lookup", async () => {
    const card = { displayName: "Dad", ordinal: 4, cardPngBase64: "abc" };
    const now = new Date("2026-08-11T12:00:00.000Z");
    mocks.findActiveAlphaInviteCardByPresentationTokenHash.mockResolvedValue(card);

    await expect(lookupAlphaInviteCardForPresentation(db, token, now)).resolves.toEqual(card);
    expect(mocks.findActiveAlphaInviteCardByPresentationTokenHash).toHaveBeenCalledWith(
      db,
      createHash("sha256").update(token).digest("hex"),
      now
    );
  });

  it("does not look up legacy name slugs", async () => {
    await expect(lookupAlphaInviteCardForPresentation(db, "dad")).resolves.toBeNull();
    expect(mocks.findActiveAlphaInviteCardByPresentationTokenHash).not.toHaveBeenCalled();
  });
});
