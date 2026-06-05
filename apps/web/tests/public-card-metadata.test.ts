import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getFullCachedCard: vi.fn(),
  getPublicCachedCardProfile: vi.fn()
}));

vi.mock("../src/lib/cards", () => ({
  getFullCachedCard: mocks.getFullCachedCard,
  getPublicCachedCardProfile: mocks.getPublicCachedCardProfile
}));

const { generateMetadata } = await import("../src/app/c/[slug]/page");

function params(slug = "cartesia") {
  return { params: Promise.resolve({ slug }) };
}

describe("public card metadata", () => {
  it("uses public card fields for page metadata", async () => {
    mocks.getPublicCachedCardProfile.mockResolvedValue({
      card: {
        slug: "cartesia",
        domain: "cartesia.ai",
        identity: {
          name: { value: "Cartesia", status: "verified", confidence: "high", citationIds: ["c1"] },
          oneLiner: {
            value: "Real-time multimodal intelligence for audio products.",
            status: "verified",
            confidence: "high",
            citationIds: ["c1"]
          },
          description: {
            value: {
              shortDescription: "Realtime audio intelligence for developers building voice products.",
              concept: "Low-latency audio intelligence infrastructure.",
              serves: "Developers building voice agents and speech products.",
              mechanism: "APIs and models for realtime audio understanding and generation."
            },
            status: "verified",
            confidence: "high",
            citationIds: ["c1"]
          }
        }
      },
      sections: []
    });

    const metadata = await generateMetadata(params());

    expect(metadata).toMatchObject({
      title: "Cartesia | Cold Start",
      description: "Realtime audio intelligence for developers building voice products.",
      openGraph: {
        title: "Cartesia | Cold Start",
        description: "Realtime audio intelligence for developers building voice products.",
        images: ["/c/cartesia/opengraph-image"]
      }
    });
    expect(mocks.getPublicCachedCardProfile).toHaveBeenCalledWith("cartesia");
    expect(mocks.getFullCachedCard).not.toHaveBeenCalled();
  });
});
