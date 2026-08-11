import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createDb: vi.fn(() => ({})),
  findActiveAlphaInviteCardByPresentationTokenHash: vi.fn()
}));

vi.mock("@cold-start/db", () => ({
  createDb: mocks.createDb,
  findActiveAlphaInviteCardByPresentationTokenHash: mocks.findActiveAlphaInviteCardByPresentationTokenHash
}));

vi.mock("../src/lib/web-env", () => ({
  webEnv: () => ({ DATABASE_URL: "postgres://example.test/cold-start" })
}));

const { generateMetadata } = await import("../src/app/i/[slug]/page");

describe("invite page metadata", () => {
  beforeEach(() => {
    mocks.findActiveAlphaInviteCardByPresentationTokenHash.mockReset();
  });

  it("keeps a legacy name slug generic without a database lookup", async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: "dad" }) });

    expect(metadata.title).toBe("Cold Start");
    expect(metadata.openGraph).toBeUndefined();
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
    expect(metadata.referrer).toBe("no-referrer");
    expect(mocks.findActiveAlphaInviteCardByPresentationTokenHash).not.toHaveBeenCalled();
  });

  it("keeps the personalized Open Graph preview behind an opaque capability", async () => {
    const token = "q".repeat(43);
    mocks.findActiveAlphaInviteCardByPresentationTokenHash.mockResolvedValue({
      displayName: "Dad",
      ordinal: 4,
      cardPngBase64: "abc"
    });

    const metadata = await generateMetadata({ params: Promise.resolve({ slug: token }) });

    expect(metadata.title).toBe("Invitation, for Dad");
    expect(metadata.openGraph).toMatchObject({
      title: "Invitation, for Dad",
      images: [{ url: `/i/${token}/card.png` }]
    });
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
    expect(metadata.referrer).toBe("no-referrer");
  });
});
