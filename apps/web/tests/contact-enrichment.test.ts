import { describe, expect, it } from "vitest";

import { buildContactEnrichmentRequestedEvent } from "../src/inngest/contact-enrichment";
import { contactEnrichmentEnabled } from "../src/inngest/env";

describe("contact enrichment dispatch", () => {
  it("honors the CONTACT_ENRICHMENT_ENABLED kill switch", () => {
    expect(
      contactEnrichmentEnabled({
        CONTACT_ENRICHMENT_ENABLED: false,
        CONTACT_ENRICHMENT_TIER: "named-only"
      })
    ).toBe(false);

    expect(
      contactEnrichmentEnabled({
        CONTACT_ENRICHMENT_ENABLED: true,
        CONTACT_ENRICHMENT_TIER: "off"
      })
    ).toBe(false);
  });

  it("builds a small replay-safe contact enrichment event", () => {
    expect(
      buildContactEnrichmentRequestedEvent({
        domain: "modal.com",
        slug: "modal",
        requestedAtMs: 1_799_999_000_000,
        tier: "named-only",
        parentGenerationRunId: "run-123",
        parentInngestRunId: "inngest-456"
      })
    ).toEqual({
      name: "card/contact-enrichment.requested",
      data: {
        domain: "modal.com",
        slug: "modal",
        requestedAtMs: 1_799_999_000_000,
        tier: "named-only",
        parentGenerationRunId: "run-123",
        parentInngestRunId: "inngest-456"
      }
    });
  });
});
