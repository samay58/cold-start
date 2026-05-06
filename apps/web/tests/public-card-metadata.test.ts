import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getFullCachedCard: vi.fn(),
  getPublicCachedCard: vi.fn()
}));

vi.mock("../src/lib/cards", () => ({
  getFullCachedCard: mocks.getFullCachedCard,
  getPublicCachedCard: mocks.getPublicCachedCard
}));

const { generateMetadata } = await import("../src/app/c/[slug]/page");

function params(slug = "cartesia") {
  return { params: Promise.resolve({ slug }) };
}

describe("public card metadata", () => {
  it("uses public card fields for page metadata", async () => {
    mocks.getPublicCachedCard.mockResolvedValue({
      slug: "cartesia",
      domain: "cartesia.ai",
      identity: {
        name: { value: "Cartesia", status: "verified", confidence: "high", citationIds: ["c1"] },
        oneLiner: {
          value: "Real-time multimodal intelligence for audio products.",
          status: "verified",
          confidence: "high",
          citationIds: ["c1"]
        }
      }
    });

    const metadata = await generateMetadata(params());

    expect(metadata).toMatchObject({
      title: "Cartesia | Cold Start",
      description: "Real-time multimodal intelligence for audio products.",
      openGraph: {
        title: "Cartesia | Cold Start",
        description: "Real-time multimodal intelligence for audio products.",
        images: ["/c/cartesia/opengraph-image"]
      }
    });
    expect(mocks.getPublicCachedCard).toHaveBeenCalledWith("cartesia");
    expect(mocks.getFullCachedCard).not.toHaveBeenCalled();
  });
});
