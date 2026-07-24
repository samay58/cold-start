import { describe, expect, it } from "vitest";
import {
  ALPHA_EVENT_BATCH_MAX_EVENTS,
  alphaEventBatchSchema,
  alphaEventNameSchema,
  alphaEventSchema,
  type AlphaEventName,
  type AlphaEventPropertiesByName
} from "../src/index";

const context = {
  extensionVersion: "1.2.3",
  browser: "chrome" as const,
  installChannel: "unlisted" as const,
  surface: "side_panel" as const,
  theme: "light" as const,
  reducedMotion: false,
  online: true
};

const validProperties = {
  "invite.accepted": {},
  "invite.store_clicked": {},
  "installation.connected": {},
  "extension.installed": {},
  "extension.updated": { previousVersion: "1.2.2" },
  "extension.action_invoked": {},
  "panel.opened": {},
  "domain.detected": { domain: "acme.example" },
  "profile.viewed": { domain: "acme.example" },
  "profile.generate_requested": { domain: "acme.example" },
  "profile.first_payoff_viewed": {
    domain: "acme.example",
    state: "substantive_first_read"
  },
  "profile.retry_requested": { domain: "acme.example", reason: "failed" },
  "lens.run_requested": { domain: "acme.example", refresh: "standard" },
  "lens.result_viewed": {
    domain: "acme.example",
    result: "filed",
    delivery: "live"
  },
  "lens.retry_requested": { domain: "acme.example", reason: "withheld" },
  "lens.category_toggled": {
    domain: "acme.example",
    category: "why-care",
    expanded: true
  },
  "lens.disclosure_toggled": {
    domain: "acme.example",
    disclosure: "holds",
    expanded: true
  },
  "research.card_activated": { domain: "acme.example", cardId: "customers" },
  "research.card_toggled": {
    domain: "acme.example",
    cardId: "signals",
    expanded: false
  },
  "research.card_run_requested": { domain: "acme.example", cardId: "competition" },
  "research.details_toggled": { domain: "acme.example", expanded: true },
  "source.opened": {
    domain: "acme.example",
    sourceClass: "independent",
    ordinal: 1
  },
  "public_card.opened": { domain: "acme.example" },
  "dossier.opened": {
    domain: "acme.example",
    personGroup: "founder",
    personOrdinal: 1,
    trigger: "hover"
  },
  "dossier.pinned": {
    domain: "acme.example",
    personGroup: "founder",
    personOrdinal: 1,
    trigger: "keyboard"
  },
  "dossier.closed": {
    domain: "acme.example",
    personGroup: "founder",
    personOrdinal: 1,
    reason: "escape"
  },
  "dossier.email_copied": {
    domain: "acme.example",
    personGroup: "executive",
    personOrdinal: 2,
    emailPosture: "inferred"
  },
  "dossier.channel_opened": {
    domain: "acme.example",
    personGroup: "executive",
    personOrdinal: 2,
    channel: "github"
  },
  "dossier.people_toggled": {
    domain: "acme.example",
    expanded: true,
    hiddenCount: 3
  },
  "settings.opened": {},
  "theme.changed": {
    previousTheme: "auto",
    theme: "dark",
    resolvedTheme: "dark"
  },
  "diagnostics.copied": { scope: "connection" },
  "support.requested": { channel: "email" },
  "client.error_presented": {
    code: "contract_mismatch",
    route: "generation",
    phase: "lens",
    status: 409,
    count: 1
  }
} satisfies AlphaEventPropertiesByName;

function event<Name extends AlphaEventName>(
  eventName: Name,
  properties: AlphaEventPropertiesByName[Name],
  sequence = 1
) {
  return {
    eventId: `event-${sequence}`,
    eventName,
    schemaVersion: 1 as const,
    occurredAt: "2026-07-24T12:00:00.000Z",
    sessionId: "session-1",
    sequence,
    interactionId: "interaction-1",
    context,
    properties
  };
}

describe("alpha analytics contract", () => {
  it("accepts every named event with its exact property schema", () => {
    for (const eventName of alphaEventNameSchema.options) {
      expect(() => alphaEventSchema.parse(event(eventName, validProperties[eventName]))).not.toThrow();
    }
  });

  it("keeps event names and property schemas discriminated", () => {
    const mismatched = event("profile.viewed", validProperties["lens.result_viewed"]);
    expect(alphaEventSchema.safeParse(mismatched).success).toBe(false);
  });

  it("accepts batches up to 25 events and rejects larger or empty batches", () => {
    const events = Array.from({ length: ALPHA_EVENT_BATCH_MAX_EVENTS }, (_, index) =>
      event("panel.opened", {}, index + 1)
    );

    expect(alphaEventBatchSchema.safeParse({ events }).success).toBe(true);
    expect(alphaEventBatchSchema.safeParse({ events: [] }).success).toBe(false);
    expect(alphaEventBatchSchema.safeParse({
      events: [...events, event("panel.opened", {}, events.length + 1)]
    }).success).toBe(false);
  });

  it.each([
    ["root invitation identity", { inviteId: "invite-1" }],
    ["root installation identity", { installationId: "install-1" }],
    ["root arbitrary metadata", { metadata: { anything: true } }]
  ])("rejects %s", (_label, extra) => {
    expect(alphaEventSchema.safeParse({
      ...event("panel.opened", {}),
      ...extra
    }).success).toBe(false);
  });

  it.each([
    ["context identity", { invitationId: "invite-1" }],
    ["context query", { query: "secret search" }],
    ["context page content", { pageContent: "private page text" }],
    ["context arbitrary metadata", { metadata: { anything: true } }]
  ])("rejects %s", (_label, extra) => {
    expect(alphaEventSchema.safeParse({
      ...event("panel.opened", {}),
      context: { ...context, ...extra }
    }).success).toBe(false);
  });

  it.each([
    ["full URL", { domain: "https://acme.example/private?token=secret" }],
    ["URL field", { domain: "acme.example", url: "https://acme.example/private" }],
    ["query string", { domain: "acme.example", query: "secret search" }],
    ["page content", { domain: "acme.example", pageContent: "private page text" }],
    ["invitation identity", { domain: "acme.example", inviteId: "invite-1" }],
    ["installation identity", { domain: "acme.example", installationId: "install-1" }],
    ["person name", { domain: "acme.example", name: "Ada Example" }],
    ["email address", { domain: "acme.example", email: "ada@acme.example" }],
    ["arbitrary metadata", { domain: "acme.example", metadata: { anything: true } }]
  ])("rejects property payloads containing a %s", (_label, properties) => {
    expect(alphaEventSchema.safeParse({
      ...event("profile.viewed", validProperties["profile.viewed"]),
      properties
    }).success).toBe(false);
  });

  it.each([
    ["raw message", { message: "Request failed for https://acme.example/private" }],
    ["raw stack", { stack: "Error: failed\n at private.ts:12" }],
    ["URL route", { route: "https://api.example.test/generate?slug=acme" }],
    ["arbitrary metadata", { metadata: { response: "private" } }]
  ])("rejects client errors containing a %s", (_label, extra) => {
    expect(alphaEventSchema.safeParse({
      ...event("client.error_presented", validProperties["client.error_presented"]),
      properties: {
        ...validProperties["client.error_presented"],
        ...extra
      }
    }).success).toBe(false);
  });
});
