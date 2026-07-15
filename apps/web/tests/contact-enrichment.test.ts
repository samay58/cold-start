import { describe, expect, it } from "vitest";

import {
  buildContactEnrichmentRequestedEvent,
  emailPatternFallbackDecision
} from "../src/inngest/contact-enrichment";
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

  it("omits deepFind by default and includes it only when the paid deep-find is requested", () => {
    const standard = buildContactEnrichmentRequestedEvent({
      domain: "modal.com",
      slug: "modal",
      requestedAtMs: 1_799_999_000_000,
      tier: "named-only"
    });
    expect(standard.data).not.toHaveProperty("deepFind");

    const deep = buildContactEnrichmentRequestedEvent({
      domain: "modal.com",
      slug: "modal",
      requestedAtMs: 1_799_999_000_000,
      tier: "named-only",
      deepFind: true
    });
    expect(deep.data).toMatchObject({ deepFind: true });
  });
});

describe("email pattern fallback guard", () => {
  const eligible = {
    contactEnrichmentEnabled: true,
    fallbackEnabled: true,
    githubPattern: null,
    githubObservedCount: 0,
    hasNamedPersonWithoutEmail: true,
    remainingBudgetUsd: 0.01
  };

  it("allows one fallback only when every trigger condition is satisfied", () => {
    expect(emailPatternFallbackDecision(eligible)).toEqual({ eligible: true });
  });

  it.each([
    ["contact enrichment disabled", { contactEnrichmentEnabled: false }],
    ["EMAIL_PATTERN_FALLBACK_ENABLED=false", { fallbackEnabled: false }],
    ["GitHub pattern available", { githubPattern: "first.last" }],
    ["GitHub observed address available", { githubObservedCount: 1 }],
    ["no named person missing an email", { hasNamedPersonWithoutEmail: false }],
    ["AgentCash budget below $0.01", { remainingBudgetUsd: 0.009 }]
  ])("blocks when %s", (reason, override) => {
    expect(emailPatternFallbackDecision({ ...eligible, ...override })).toEqual({
      eligible: false,
      reason
    });
  });
});
