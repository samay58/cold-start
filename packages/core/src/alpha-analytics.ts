import { z } from "zod";
import { researchLayerIdSchema } from "./research-sections";

export const ALPHA_EVENT_SCHEMA_VERSION = 1 as const;
export const ALPHA_EVENT_BATCH_MAX_EVENTS = 25;
export const ALPHA_EVENT_BATCH_MAX_BYTES = 64 * 1024;

export const alphaEventNameSchema = z.enum([
  "invite.accepted",
  "invite.store_clicked",
  "installation.connected",
  "extension.installed",
  "extension.updated",
  "extension.action_invoked",
  "panel.opened",
  "domain.detected",
  "profile.viewed",
  "profile.generate_requested",
  "profile.first_payoff_viewed",
  "profile.retry_requested",
  "lens.run_requested",
  "lens.result_viewed",
  "lens.retry_requested",
  "lens.category_toggled",
  "lens.disclosure_toggled",
  "research.card_activated",
  "research.card_toggled",
  "research.card_run_requested",
  "research.details_toggled",
  "source.opened",
  "public_card.opened",
  "dossier.opened",
  "dossier.pinned",
  "dossier.closed",
  "dossier.email_copied",
  "dossier.channel_opened",
  "dossier.people_toggled",
  "settings.opened",
  "theme.changed",
  "diagnostics.copied",
  "support.requested",
  "client.error_presented",
  "refile.hold_started",
  "refile.fired",
  "refile.hold_abandoned"
]);

export const alphaSurfaceSchema = z.enum([
  "invite",
  "background",
  "side_panel",
  "settings",
  "public_card"
]);

const boundedIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);

const extensionVersionSchema = z.union([
  z.literal("unknown"),
  z.string().min(1).max(32).regex(/^\d+(?:\.\d+){0,3}$/)
]);

const companyDomainSchema = z
  .string()
  .min(3)
  .max(253)
  .regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/);

const ordinalSchema = z.number().int().min(1).max(100);
const emptyPropertiesSchema = z.object({}).strict();
const domainPropertiesSchema = z.object({ domain: companyDomainSchema }).strict();
const personPropertiesShape = {
  domain: companyDomainSchema,
  personGroup: z.enum(["founder", "executive"]),
  personOrdinal: ordinalSchema
} as const;

export const alphaEventContextSchema = z.object({
  extensionVersion: extensionVersionSchema,
  browser: z.enum(["chrome", "firefox"]),
  installChannel: z.enum(["unlisted", "unpacked", "unknown"]),
  surface: alphaSurfaceSchema,
  theme: z.enum(["light", "dark"]),
  reducedMotion: z.boolean(),
  online: z.boolean()
}).strict();

const alphaEventBaseSchema = z.object({
  eventId: boundedIdSchema,
  eventName: alphaEventNameSchema,
  schemaVersion: z.literal(ALPHA_EVENT_SCHEMA_VERSION),
  occurredAt: z.string().datetime({ offset: true }),
  sessionId: boundedIdSchema,
  sequence: z.number().int().nonnegative().max(2_147_483_647),
  interactionId: boundedIdSchema.optional(),
  context: alphaEventContextSchema,
  properties: z.unknown()
}).strict();

function alphaEventSchemaFor<
  const Name extends z.infer<typeof alphaEventNameSchema>,
  Properties extends z.ZodTypeAny
>(eventName: Name, properties: Properties) {
  return alphaEventBaseSchema.extend({
    eventName: z.literal(eventName),
    properties
  });
}

const retryReasonSchema = z.enum([
  "failed",
  "watchdog",
  "contract_mismatch",
  "connection",
  "withheld",
  "unknown"
]);

// The live category ids are why-care, the-case, learn-next, and pay-attention. The three
// retired ids stay listed so events from an installed client that predates the fold still
// validate rather than 400 on ingest.
const lensCategorySchema = z.enum([
  "why-care",
  "the-case",
  "learn-next",
  "pay-attention",
  "must-be-true",
  "could-break",
  "why-now"
]);

// "timing" is retired with the Why now row and kept for the same legacy-client reason.
const lensDisclosureSchema = z.enum([
  "lede",
  "holds",
  "breaks",
  "question",
  "sources",
  "timing"
]);

const sourceClassSchema = z.enum(["independent", "reporting", "company"]);
const emailPostureSchema = z.enum(["observed", "inferred"]);
const themeSchema = z.enum(["light", "dark"]);

const inviteAcceptedEventSchema = alphaEventSchemaFor("invite.accepted", emptyPropertiesSchema);
const inviteStoreClickedEventSchema = alphaEventSchemaFor("invite.store_clicked", emptyPropertiesSchema);
const installationConnectedEventSchema = alphaEventSchemaFor("installation.connected", emptyPropertiesSchema);
const extensionInstalledEventSchema = alphaEventSchemaFor("extension.installed", emptyPropertiesSchema);
const extensionUpdatedEventSchema = alphaEventSchemaFor(
  "extension.updated",
  z.object({ previousVersion: extensionVersionSchema }).strict()
);
const extensionActionInvokedEventSchema = alphaEventSchemaFor("extension.action_invoked", emptyPropertiesSchema);
const panelOpenedEventSchema = alphaEventSchemaFor("panel.opened", emptyPropertiesSchema);
const domainDetectedEventSchema = alphaEventSchemaFor("domain.detected", domainPropertiesSchema);
const profileViewedEventSchema = alphaEventSchemaFor("profile.viewed", domainPropertiesSchema);
const profileGenerateRequestedEventSchema = alphaEventSchemaFor("profile.generate_requested", domainPropertiesSchema);
const profileFirstPayoffViewedEventSchema = alphaEventSchemaFor(
  "profile.first_payoff_viewed",
  z.object({
    domain: companyDomainSchema,
    state: z.enum(["receipt", "substantive_first_read", "withheld"])
  }).strict()
);
const profileRetryRequestedEventSchema = alphaEventSchemaFor(
  "profile.retry_requested",
  z.object({ domain: companyDomainSchema, reason: retryReasonSchema }).strict()
);
const lensRunRequestedEventSchema = alphaEventSchemaFor(
  "lens.run_requested",
  z.object({
    domain: companyDomainSchema,
    refresh: z.enum(["standard", "force_evidence"])
  }).strict()
);
const lensResultViewedEventSchema = alphaEventSchemaFor(
  "lens.result_viewed",
  z.object({
    domain: companyDomainSchema,
    result: z.enum(["filed", "withheld"]),
    delivery: z.enum(["live", "cached"])
  }).strict()
);
const lensRetryRequestedEventSchema = alphaEventSchemaFor(
  "lens.retry_requested",
  z.object({ domain: companyDomainSchema, reason: retryReasonSchema }).strict()
);
const lensCategoryToggledEventSchema = alphaEventSchemaFor(
  "lens.category_toggled",
  z.object({
    domain: companyDomainSchema,
    category: lensCategorySchema,
    expanded: z.boolean()
  }).strict()
);
const lensDisclosureToggledEventSchema = alphaEventSchemaFor(
  "lens.disclosure_toggled",
  z.object({
    domain: companyDomainSchema,
    disclosure: lensDisclosureSchema,
    expanded: z.boolean()
  }).strict()
);
const researchCardActivatedEventSchema = alphaEventSchemaFor(
  "research.card_activated",
  z.object({ domain: companyDomainSchema, cardId: researchLayerIdSchema }).strict()
);
const researchCardToggledEventSchema = alphaEventSchemaFor(
  "research.card_toggled",
  z.object({
    domain: companyDomainSchema,
    cardId: researchLayerIdSchema,
    expanded: z.boolean()
  }).strict()
);
const researchCardRunRequestedEventSchema = alphaEventSchemaFor(
  "research.card_run_requested",
  z.object({ domain: companyDomainSchema, cardId: researchLayerIdSchema }).strict()
);
const researchDetailsToggledEventSchema = alphaEventSchemaFor(
  "research.details_toggled",
  z.object({ domain: companyDomainSchema, expanded: z.boolean() }).strict()
);
const sourceOpenedEventSchema = alphaEventSchemaFor(
  "source.opened",
  z.object({
    domain: companyDomainSchema,
    sourceClass: sourceClassSchema,
    ordinal: ordinalSchema
  }).strict()
);
const publicCardOpenedEventSchema = alphaEventSchemaFor("public_card.opened", domainPropertiesSchema);
const dossierOpenedEventSchema = alphaEventSchemaFor(
  "dossier.opened",
  z.object({
    ...personPropertiesShape,
    trigger: z.enum(["hover", "focus"])
  }).strict()
);
const dossierPinnedEventSchema = alphaEventSchemaFor(
  "dossier.pinned",
  z.object({
    ...personPropertiesShape,
    trigger: z.enum(["pointer", "keyboard"])
  }).strict()
);
const dossierClosedEventSchema = alphaEventSchemaFor(
  "dossier.closed",
  z.object({
    ...personPropertiesShape,
    reason: z.enum(["dismiss_button", "escape", "trigger", "focus_leave", "pointer_leave"])
  }).strict()
);
const dossierEmailCopiedEventSchema = alphaEventSchemaFor(
  "dossier.email_copied",
  z.object({
    ...personPropertiesShape,
    emailPosture: emailPostureSchema
  }).strict()
);
const dossierChannelOpenedEventSchema = alphaEventSchemaFor(
  "dossier.channel_opened",
  z.object({
    ...personPropertiesShape,
    channel: z.enum(["github", "x", "site"])
  }).strict()
);
const dossierPeopleToggledEventSchema = alphaEventSchemaFor(
  "dossier.people_toggled",
  z.object({
    domain: companyDomainSchema,
    expanded: z.boolean(),
    hiddenCount: z.number().int().nonnegative().max(100)
  }).strict()
);
const settingsOpenedEventSchema = alphaEventSchemaFor("settings.opened", emptyPropertiesSchema);
const themeChangedEventSchema = alphaEventSchemaFor(
  "theme.changed",
  z.object({
    previousTheme: z.enum(["auto", "light", "dark"]),
    theme: z.enum(["auto", "light", "dark"]),
    resolvedTheme: themeSchema
  }).strict()
);
const diagnosticsCopiedEventSchema = alphaEventSchemaFor(
  "diagnostics.copied",
  z.object({ scope: z.enum(["connection", "generation", "full"]) }).strict()
);
const supportRequestedEventSchema = alphaEventSchemaFor(
  "support.requested",
  z.object({ channel: z.literal("email") }).strict()
);
const refileHoldStartedEventSchema = alphaEventSchemaFor("refile.hold_started", domainPropertiesSchema);
const refileFiredEventSchema = alphaEventSchemaFor("refile.fired", domainPropertiesSchema);
const refileHoldAbandonedEventSchema = alphaEventSchemaFor("refile.hold_abandoned", domainPropertiesSchema);
const clientErrorPresentedEventSchema = alphaEventSchemaFor(
  "client.error_presented",
  z.object({
    code: z.string().min(1).max(64).regex(/^[a-z][a-z0-9_]*$/),
    route: z.enum([
      "invite",
      "connection",
      "bootstrap",
      "card",
      "generation",
      "events",
      "support",
      "unknown"
    ]),
    phase: z.enum([
      "startup",
      "connection",
      "navigation",
      "profile",
      "first_payoff",
      "lens",
      "research",
      "dossier",
      "settings",
      "analytics",
      "support"
    ]),
    status: z.number().int().min(0).max(599),
    count: z.number().int().min(1).max(200).optional()
  }).strict()
);

export const alphaEventSchema = z.discriminatedUnion("eventName", [
  inviteAcceptedEventSchema,
  inviteStoreClickedEventSchema,
  installationConnectedEventSchema,
  extensionInstalledEventSchema,
  extensionUpdatedEventSchema,
  extensionActionInvokedEventSchema,
  panelOpenedEventSchema,
  domainDetectedEventSchema,
  profileViewedEventSchema,
  profileGenerateRequestedEventSchema,
  profileFirstPayoffViewedEventSchema,
  profileRetryRequestedEventSchema,
  lensRunRequestedEventSchema,
  lensResultViewedEventSchema,
  lensRetryRequestedEventSchema,
  lensCategoryToggledEventSchema,
  lensDisclosureToggledEventSchema,
  researchCardActivatedEventSchema,
  researchCardToggledEventSchema,
  researchCardRunRequestedEventSchema,
  researchDetailsToggledEventSchema,
  sourceOpenedEventSchema,
  publicCardOpenedEventSchema,
  dossierOpenedEventSchema,
  dossierPinnedEventSchema,
  dossierClosedEventSchema,
  dossierEmailCopiedEventSchema,
  dossierChannelOpenedEventSchema,
  dossierPeopleToggledEventSchema,
  settingsOpenedEventSchema,
  themeChangedEventSchema,
  diagnosticsCopiedEventSchema,
  supportRequestedEventSchema,
  clientErrorPresentedEventSchema,
  refileHoldStartedEventSchema,
  refileFiredEventSchema,
  refileHoldAbandonedEventSchema
]);

export const alphaEventBatchSchema = z.object({
  events: z.array(alphaEventSchema).min(1).max(ALPHA_EVENT_BATCH_MAX_EVENTS)
}).strict().superRefine((batch, context) => {
  const byteLength = new TextEncoder().encode(JSON.stringify(batch)).byteLength;
  if (byteLength > ALPHA_EVENT_BATCH_MAX_BYTES) {
    context.addIssue({
      code: z.ZodIssueCode.too_big,
      maximum: ALPHA_EVENT_BATCH_MAX_BYTES,
      type: "array",
      inclusive: true,
      exact: false,
      message: `Analytics batch exceeds ${ALPHA_EVENT_BATCH_MAX_BYTES} bytes`,
      path: ["events"]
    });
  }
});

export type AlphaEventName = z.infer<typeof alphaEventNameSchema>;
export type AlphaSurface = z.infer<typeof alphaSurfaceSchema>;
export type AlphaEventContext = z.infer<typeof alphaEventContextSchema>;
export type AlphaEvent = z.infer<typeof alphaEventSchema>;
export type AlphaEventProperties = AlphaEvent["properties"];
export type AlphaEventFor<Name extends AlphaEventName> = Extract<AlphaEvent, { eventName: Name }>;
export type AlphaEventPropertiesByName = {
  [Name in AlphaEventName]: AlphaEventFor<Name>["properties"];
};
export type AlphaEventBatch = z.infer<typeof alphaEventBatchSchema>;
