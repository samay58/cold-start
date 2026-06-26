import {
  companySlugFromDomain,
  deriveLegacyResearchSectionsFromCard,
  type ColdStartCard,
  type GenerationTrace
} from "@cold-start/core";
import {
  createDb,
  findCardBySlug,
  findSourcesBySlug,
  recordCardEvidence,
  recordResearchRunEvent,
  updateGenerationRunTrace,
  upsertCard,
  upsertResearchSections
} from "@cold-start/db";
import {
  applyProviderFactCandidates,
  cardWithExtractedSections,
  extractedCardSectionsSchema,
  filterSourcesForDomain,
  sourceGateTrace,
  type ExtractedCardSections
} from "@cold-start/pipeline";
import {
  createPeopleEmailWebset,
  fetchDirectExaContactSources,
  fetchStableenrichPeopleEmailSources,
  pollPeopleEmailWebset,
  type DirectExaEnv,
  type PeopleEmailHint,
  type ProviderSource,
  type StableenrichEnv,
  type WebsetsPeopleEmailResult
} from "@cold-start/providers";

import { canonicalCompanyDomain } from "../lib/domain";
import { webEnv } from "../lib/env";
import { boundedErrorMessage } from "../lib/errors";
import {
  canStoreCardSnapshot,
  noteSkippedUnderfilledSnapshot,
  prepareCardSnapshotForStorage
} from "./card-storage";
import { inngest } from "./client";
import {
  contactEnrichmentEnabled,
  directExaEnabled,
  directExaEnvFromProcess,
  stableenrichEnvFromProcess,
  websetsEnvFromProcess,
  type ContactEnrichmentTier
} from "./env";
import {
  completedStep,
  generationMilestoneElapsedMs,
  mergeGenerationTrace,
  mergeTracePatch,
  requestedAtMsFromGenerationEvent,
  skippedStep,
  writeGenerationMilestoneValue,
  type ProviderTrace
} from "./generation-trace";
import {
  agentcashBudgetCeilingUsd,
  applyStableenrichEndpointYield,
  failedStableenrichEndpoint,
  withStableenrichEndpointBudgets
} from "./provider-trace";
import {
  mergeSources,
  providerSourcesFromStoredSources,
  recordSourcesForCard,
  sectionsWithSourceCitations
} from "./source-fetching";

const CONTACT_ENRICHMENT_EVENT_NAME = "card/contact-enrichment.requested" as const;

type TimedResult<T> = { durationMs: number; value: T };

export function buildContactEnrichmentRequestedEvent(input: {
  domain: string;
  slug: string;
  requestedAtMs: number;
  tier: ContactEnrichmentTier;
  parentGenerationRunId?: string | null;
  parentInngestRunId?: string | null;
}) {
  return {
    name: CONTACT_ENRICHMENT_EVENT_NAME,
    data: {
      domain: input.domain,
      slug: input.slug,
      requestedAtMs: input.requestedAtMs,
      tier: input.tier,
      ...(input.parentGenerationRunId ? { parentGenerationRunId: input.parentGenerationRunId } : {}),
      ...(input.parentInngestRunId ? { parentInngestRunId: input.parentInngestRunId } : {})
    }
  };
}

async function timed<T>(fn: () => Promise<T> | T): Promise<TimedResult<T>> {
  const startedAt = Date.now();
  const value = await fn();
  return { durationMs: Date.now() - startedAt, value };
}

function rawSlugForRun(input: unknown, domainInput?: unknown): string {
  if (typeof input !== "string" || input.trim().length === 0) {
    if (typeof domainInput === "string" && domainInput.trim().length > 0) {
      try {
        return companySlugFromDomain(canonicalCompanyDomain(domainInput)).slice(0, 120);
      } catch {
        return "unknown";
      }
    }

    return "unknown";
  }

  return input.trim().slice(0, 120);
}

function stringValue(input: unknown): string | null {
  return typeof input === "string" && input.trim().length > 0 ? input.trim() : null;
}

function peopleHintsFromSections(sections: ExtractedCardSections): PeopleEmailHint[] {
  return [
    ...(sections.team.founders.value ?? []),
    ...(sections.team.keyExecs.value ?? [])
  ].map((person) => ({
    name: person.name,
    role: person.role,
    sourceUrl: person.sourceUrl,
    email: person.email ?? null
  }));
}

function peopleHintsFromCard(card: ColdStartCard): PeopleEmailHint[] {
  return [
    ...(card.team.founders.value ?? []),
    ...(card.team.keyExecs.value ?? [])
  ].map((person) => ({
    name: person.name,
    role: person.role,
    sourceUrl: person.sourceUrl,
    email: person.email ?? null
  }));
}

export function cardHasContactTargets(card: ColdStartCard, tier: ContactEnrichmentTier) {
  if (tier === "full") {
    return true;
  }

  return peopleHintsFromCard(card).some((person) =>
    Boolean(person.name?.trim()) && !person.email
  );
}

function peopleEmailCount(sections: ExtractedCardSections) {
  return [
    ...(sections.team.founders.value ?? []),
    ...(sections.team.keyExecs.value ?? [])
  ].filter((person) => Boolean(person.email)).length;
}

async function fetchContactSourcesForBasics(input: {
  acceptedSources: ProviderSource[];
  directExaEnv: DirectExaEnv;
  domain: string;
  initialProviders: ProviderTrace;
  maxStableenrichBudgetUsd?: number | undefined;
  peopleHints: PeopleEmailHint[];
  stableEnv: StableenrichEnv;
  // True when the caller runs the webset lifecycle (create early, poll durably). It suppresses
  // the StableEnrich email probes; websets results merge in after the durable poll.
  websetsOwnsEmailPath: boolean;
}) {
  const [directContactResult, stableContactResult] = await Promise.allSettled([
    directExaEnabled()
      ? fetchDirectExaContactSources({ env: input.directExaEnv, domain: input.domain, peopleHints: input.peopleHints })
      : Promise.resolve({ sources: [], facts: [], failures: [], skipped: true, requestCount: 0, estimatedCostUsd: 0 }),
    input.websetsOwnsEmailPath
      ? Promise.resolve({
          sources: [],
          facts: [],
          failures: [],
          endpoints: [
            {
              name: "stableenrich" as const,
              endpointUrl: "stableenrich",
              status: "skipped" as const,
              sourceCount: 0,
              factCount: 0,
              error: "EXA_WEBSETS_CONTACTS_ENABLED=true"
            }
          ],
          emailDiscovery: [],
          budgetCeilingHit: false
        })
      : fetchStableenrichPeopleEmailSources({
          env: input.stableEnv,
          domain: input.domain,
          sourceHints: input.acceptedSources,
          peopleHints: input.peopleHints,
          maxBudgetUsd: input.maxStableenrichBudgetUsd
        }),
  ]);
  const directContactSources = directContactResult.status === "fulfilled" ? directContactResult.value.sources : [];
  const directContactFacts = directContactResult.status === "fulfilled" ? directContactResult.value.facts : [];
  const directContactFailureCount = directContactResult.status === "fulfilled" ? directContactResult.value.failures.length : 1;
  const stableContactSources = stableContactResult.status === "fulfilled" ? stableContactResult.value.sources : [];
  const stableContactFacts = stableContactResult.status === "fulfilled" ? stableContactResult.value.facts : [];
  const stableContactFailures = stableContactResult.status === "fulfilled"
    ? stableContactResult.value.failures
    : [{ name: "stableenrich" as const, endpointUrl: "stableenrich", error: boundedErrorMessage(stableContactResult.reason) }];
  const stableContactEndpoints = stableContactResult.status === "fulfilled"
    ? withStableenrichEndpointBudgets(stableContactResult.value.endpoints)
    : [failedStableenrichEndpoint(stableContactResult.reason)];
  const sources = mergeSources(input.acceptedSources, directContactSources, stableContactSources);
  const sourceGate = filterSourcesForDomain({ domain: input.domain, sources });
  const initialDirectExa = input.initialProviders.directExa ?? { skipped: true, sourceCount: 0, failureCount: 0 };
  const directContactRequestCount = directContactResult.status === "fulfilled" ? directContactResult.value.requestCount ?? 0 : 0;
  const directContactCostUsd = directContactResult.status === "fulfilled" ? directContactResult.value.estimatedCostUsd ?? 0 : 0;
  const initialStable = input.initialProviders.stableenrich;
  const stableEmailDiscovery = stableContactResult.status === "fulfilled"
    ? stableContactResult.value.emailDiscovery ?? []
    : [];

  return {
    sources: sourceGate.accepted,
    providerFacts: [...stableContactFacts, ...directContactFacts],
    trace: {
      providers: {
        ...input.initialProviders,
        directExa: {
          skipped: initialDirectExa.skipped && (directContactResult.status === "fulfilled" ? directContactResult.value.skipped : false),
          sourceCount: initialDirectExa.sourceCount + directContactSources.length,
          failureCount: initialDirectExa.failureCount + directContactFailureCount,
          requestCount: (initialDirectExa.requestCount ?? 0) + directContactRequestCount,
          estimatedCostUsd: Number(((initialDirectExa.estimatedCostUsd ?? 0) + directContactCostUsd).toFixed(4))
        },
        stableenrich: {
          sourceCount: (initialStable?.sourceCount ?? 0) + stableContactSources.length,
          factCount: (initialStable?.factCount ?? 0) + stableContactFacts.length,
          failureCount: (initialStable?.failureCount ?? 0) + stableContactFailures.length,
          endpoints: [...(initialStable?.endpoints ?? []), ...stableContactEndpoints],
          ...(stableContactResult.status === "fulfilled" && stableContactResult.value.budgetCeilingHit ? { budgetCeilingHit: true } : {})
        },
        // The durable websets poll in contactEnrichmentFunction overwrites this node when the
        // websets path is active; here it only marks that no inline fetch happened.
        websets: { skipped: true, sourceCount: 0, factCount: 0, failureCount: 0 },
        mergedSourceCount: sources.length,
        ...(stableEmailDiscovery.length > 0 ? { emailDiscovery: stableEmailDiscovery } : {})
      },
      sourceGate: sourceGateTrace(sourceGate)
    }
  };
}

export const contactEnrichmentFunction = inngest.createFunction(
  { id: "contact-enrichment" },
  { event: CONTACT_ENRICHMENT_EVENT_NAME },
  async ({ event, runId, step }) => {
    const runtimeEnv = webEnv();
    const { DATABASE_URL } = runtimeEnv;
    const db = createDb(DATABASE_URL);
    const requestedAtMs = requestedAtMsFromGenerationEvent(event);
    const parentGenerationRunId = stringValue(event.data.parentGenerationRunId);
    const trace: GenerationTrace = {
      jobKind: "basics",
      mode: "basics",
      inngest: {
        ...(typeof event.id === "string" ? { eventId: event.id } : {}),
        ...(typeof runId === "string" ? { runId } : {})
      },
      steps: {}
    };

    let domain = "invalid-domain";
    let slug = rawSlugForRun(event.data.slug);
    let currentStage = "canonicalize-domain";

    const eventRunId = () =>
      parentGenerationRunId ?? trace.inngest?.runId ?? `contacts:${slug}`;
    const recordEvent = (
      name: string,
      type: string,
      message: string,
      metadata: Record<string, unknown> = {}
    ) =>
      step.run(`contact-event-${name}`, () =>
        recordResearchRunEvent(db, {
          runId: eventRunId(),
          slug,
          domain,
          sectionId: null,
          type,
          message,
          metadata
        }).catch(() => null)
      );

    try {
      domain = canonicalCompanyDomain(event.data.domain);
      slug = companySlugFromDomain(domain);
    } catch (error) {
      trace.failure = {
        stage: currentStage,
        message: boundedErrorMessage(error),
        ...(error instanceof Error ? { className: error.name } : {})
      };
      await recordEvent("invalid-domain", "contacts.failed", boundedErrorMessage(error));
      throw error;
    }

    if (!contactEnrichmentEnabled(runtimeEnv)) {
      trace.steps = {
        ...trace.steps,
        "contact-enrichment": skippedStep("CONTACT_ENRICHMENT_ENABLED=false")
      };
      await recordEvent("disabled", "contacts.skipped", "Contact enrichment disabled", {
        tier: runtimeEnv.CONTACT_ENRICHMENT_TIER
      });
      return { slug, skipped: "disabled" };
    }

    await recordEvent("started", "contacts.started", "Started async contact enrichment", {
      tier: runtimeEnv.CONTACT_ENRICHMENT_TIER
    });

    try {
      currentStage = "load-card";
      const existingCard = await step.run("load-card", () => findCardBySlug(db, slug, { allowStale: true }));
      if (!existingCard) {
        trace.steps = {
          ...trace.steps,
          "load-card": skippedStep("card not found")
        };
        await recordEvent("missing-card", "contacts.skipped", "No stored card found for contact enrichment");
        return { slug, skipped: "card_not_found" };
      }

      currentStage = "load-sources";
      const acceptedSources = await step.run("load-sources", async () =>
        providerSourcesFromStoredSources(await findSourcesBySlug(db, slug))
      );
      const baseSections = extractedCardSectionsSchema.parse(
        sectionsWithSourceCitations(existingCard, acceptedSources)
      );
      const peopleHints = peopleHintsFromSections(baseSections);
      if (runtimeEnv.CONTACT_ENRICHMENT_TIER === "named-only" && peopleHints.length === 0) {
        trace.steps = {
          ...trace.steps,
          "contact-enrichment": skippedStep("no named people to verify")
        };
        await recordEvent("no-people", "contacts.skipped", "No named people found for contact enrichment");
        return { slug, skipped: "no_named_people" };
      }

      const stableEnv = stableenrichEnvFromProcess();
      const directExaEnv = directExaEnvFromProcess();
      const websetsEnv = websetsEnvFromProcess();
      const websetsExternalId = `cold-start-contact-${slug}-${parentGenerationRunId ?? trace.inngest?.runId ?? requestedAtMs}`;
      const websetsOwnsEmailPath = runtimeEnv.EXA_WEBSETS_CONTACTS_ENABLED && Boolean(websetsEnv.EXA_WEBSETS_API_KEY?.trim());

      // Websets are async agent searches: create the webset first so it works while the other
      // contact providers run, then poll durably below. The old inline fetch gave it ~4.5s and
      // recorded 0 items on every production run.
      currentStage = "create-websets-contact-search";
      const websetCreated: { skipped: true; reason: string } | { skipped: false; websetId: string; dashboardUrl: string | null; endpointUrl: string } =
        websetsOwnsEmailPath
          ? await step.run("create-websets-contact-search", async () => {
              try {
                return await createPeopleEmailWebset({ env: websetsEnv, domain, peopleHints, externalId: websetsExternalId });
              } catch (error) {
                return { skipped: true as const, reason: boundedErrorMessage(error) };
              }
            })
          : { skipped: true, reason: "websets contacts disabled or EXA_WEBSETS_API_KEY missing" };

      currentStage = "fetch-contact-sources";
      const contactSourceResult = await step.run("fetch-contact-sources", async () => {
        const result = await timed(() =>
          fetchContactSourcesForBasics({
            acceptedSources,
            directExaEnv,
            domain,
            initialProviders: {},
            maxStableenrichBudgetUsd: agentcashBudgetCeilingUsd({
              mode: "basics",
              override: runtimeEnv.PER_RUN_AGENTCASH_BUDGET_USD
            }),
            peopleHints,
            stableEnv,
            websetsOwnsEmailPath
          })
        );

        return {
          value: result.value,
          tracePatch: {
            steps: {
              "fetch-contact-sources": completedStep(result.durationMs)
            },
            providers: result.value.trace.providers,
            sourceGate: result.value.trace.sourceGate
          }
        };
      });
      mergeTracePatch(trace, contactSourceResult.tracePatch);
      await recordEvent("sources-fetched", "source.contacts", "Checked people and email sources", {
        sourceCount: contactSourceResult.value.sources.length,
        providerFactCount: contactSourceResult.value.providerFacts.length
      });

      currentStage = "poll-websets-contact-search";
      let websetsLate: WebsetsPeopleEmailResult | null = null;
      if (!websetCreated.skipped) {
        const pollAttempts = Math.max(1, Math.min(20, runtimeEnv.WEBSETS_POLL_ATTEMPTS ?? 6));
        const pollIntervalSeconds = Math.max(1, Math.min(120, runtimeEnv.WEBSETS_POLL_INTERVAL_SECONDS ?? 20));
        let pollsMade = 0;

        for (let attempt = 1; attempt <= pollAttempts; attempt += 1) {
          await step.sleep(`websets-wait-${attempt}`, `${pollIntervalSeconds}s`);
          websetsLate = await step.run(`poll-websets-${attempt}`, () =>
            pollPeopleEmailWebset({
              env: websetsEnv,
              domain,
              peopleHints,
              websetId: websetCreated.websetId,
              dashboardUrl: websetCreated.dashboardUrl
            })
          );
          pollsMade = attempt;
          // Transient poll failures (timeouts, 5xx) do not end the window; the attempts cap
          // bounds the spend either way.
          if ((websetsLate.trace.acceptedEmailCount ?? 0) > 0) {
            break;
          }
        }

        if (websetsLate) {
          mergeTracePatch(trace, {
            providers: {
              websets: {
                ...websetsLate.trace,
                requestCount: 1 + pollsMade
              },
              ...(websetsLate.emailDiscovery.length > 0
                ? { emailDiscovery: [...(trace.providers?.emailDiscovery ?? []), ...websetsLate.emailDiscovery] }
                : {})
            }
          });
          await recordEvent(
            "websets-polled",
            "contacts.websets",
            `Websets returned ${websetsLate.trace.acceptedEmailCount ?? 0} verified emails after ${pollsMade} poll${pollsMade === 1 ? "" : "s"}`,
            {
              acceptedEmailCount: websetsLate.trace.acceptedEmailCount ?? 0,
              itemCount: websetsLate.trace.itemCount ?? 0,
              polls: pollsMade
            }
          );
        }
      }
      const websetsLateSources = websetsLate
        ? filterSourcesForDomain({ domain, sources: websetsLate.sources }).accepted
        : [];
      const contactProviderFacts = [...contactSourceResult.value.providerFacts, ...(websetsLate?.facts ?? [])];

      currentStage = "enrich-contacts";
      const contactEnriched = await step.run("enrich-contacts", async () => {
        const result = await timed(() => {
          const providerFactMerge = applyProviderFactCandidates(baseSections, contactProviderFacts);
          return {
            sections: extractedCardSectionsSchema.parse(providerFactMerge.sections),
            providerFactMerge
          };
        });

        return {
          value: result.value,
          tracePatch: {
            steps: {
              "enrich-contacts": {
                ...completedStep(result.durationMs),
                message: `${peopleEmailCount(result.value.sections)} verified work emails`
              }
            }
          }
        };
      });
      mergeTracePatch(trace, contactEnriched.tracePatch);
      applyStableenrichEndpointYield(trace, contactEnriched.value.providerFactMerge.trace.appliedByEndpoint);

      const contactCard = cardWithExtractedSections(existingCard, contactEnriched.value.sections);
      const cardToStore = prepareCardSnapshotForStorage("basics", existingCard, contactCard);
      let contactsReadyMs: number | null = null;
      if (canStoreCardSnapshot("basics", cardToStore)) {
        const contactStore = await step.run("upsert-contact-card", async () => ({
          row: await upsertCard(db, cardToStore),
          milestoneMs: generationMilestoneElapsedMs(requestedAtMs)
        }));
        contactsReadyMs = contactStore.milestoneMs;
        const contactRow = contactStore.row;
        await step.run("record-contact-card-evidence", () => recordCardEvidence(db, contactRow.id, cardToStore));
        await step.run("record-contact-research-sections", () => upsertResearchSections(db, deriveLegacyResearchSectionsFromCard(cardToStore)));
        await step.run("record-contact-sources", () =>
          recordSourcesForCard(db, contactRow.id, mergeSources(acceptedSources, contactSourceResult.value.sources, websetsLateSources))
        );
      } else {
        noteSkippedUnderfilledSnapshot(trace, "skip-underfilled-contact-card", cardToStore);
      }

      writeGenerationMilestoneValue(
        trace,
        "contactsReadyMs",
        contactsReadyMs ?? generationMilestoneElapsedMs(requestedAtMs)
      );
      if (parentGenerationRunId) {
        await step.run("update-parent-contact-trace", () =>
          updateGenerationRunTrace(db, {
            id: parentGenerationRunId,
            patch: (existingTrace) => mergeGenerationTrace(existingTrace, trace)
          }).catch((error) => {
            // Patching the parent run's trace is best-effort. A failure here must not fail
            // contact enrichment or poison the parent generation run's lifecycle.
            console.warn("[contact-enrichment] parent trace patch failed; continuing", error);
            return null;
          })
        );
      }

      await recordEvent("complete", "contacts.enriched", `Found ${peopleEmailCount(contactEnriched.value.sections)} verified work emails`, {
        emailCount: peopleEmailCount(contactEnriched.value.sections)
      });
      return { slug, emailCount: peopleEmailCount(contactEnriched.value.sections) };
    } catch (error) {
      trace.failure = {
        stage: currentStage,
        message: boundedErrorMessage(error),
        ...(error instanceof Error ? { className: error.name } : {})
      };
      await recordEvent("failed", "contacts.failed", boundedErrorMessage(error), {
        stage: currentStage
      });
      throw error;
    }
  }
);
