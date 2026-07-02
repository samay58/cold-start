import type { ColdStartCard } from "@cold-start/core";
import type { extractCompanyBlockClaims } from "@cold-start/llm";
import type { BlockEnrichmentPatch } from "@cold-start/pipeline";

// Shape an extracted block-claims result into the pipeline's BlockEnrichmentPatch. Shared by the
// main generation worker (functions.ts) and the async card-enrichment worker so the mapping stays
// in one place and the two paths cannot drift.
export function pipelineBlockPatch(input: Awaited<ReturnType<typeof extractCompanyBlockClaims>>): BlockEnrichmentPatch {
  const patch: BlockEnrichmentPatch = { citations: input.citations };

  if (input.identity) {
    const identity: NonNullable<BlockEnrichmentPatch["identity"]> = {};
    if (input.identity.oneLiner) {
      identity.oneLiner = input.identity.oneLiner;
    }
    if (input.identity.description) {
      identity.description = input.identity.description;
    }
    if (Object.keys(identity).length > 0) {
      patch.identity = identity;
    }
  }

  if (input.funding) {
    const funding: NonNullable<BlockEnrichmentPatch["funding"]> = {};
    if (input.funding.totalRaisedUsd) {
      funding.totalRaisedUsd = input.funding.totalRaisedUsd;
    }
    if (input.funding.lastRound) {
      funding.lastRound = input.funding.lastRound;
    }
    if (input.funding.rounds) {
      funding.rounds = input.funding.rounds;
    }
    if (input.funding.investors) {
      funding.investors = input.funding.investors;
    }
    if (Object.keys(funding).length > 0) {
      patch.funding = funding;
    }
  }

  if (input.team) {
    const team: NonNullable<BlockEnrichmentPatch["team"]> = {};
    if (input.team.founders) {
      team.founders = input.team.founders;
    }
    if (input.team.keyExecs) {
      team.keyExecs = input.team.keyExecs;
    }
    if (input.team.headcount) {
      team.headcount = input.team.headcount;
    }
    if (Object.keys(team).length > 0) {
      patch.team = team;
    }
  }

  if (input.signals) {
    patch.signals = input.signals;
  }
  if (input.comparables) {
    patch.comparables = input.comparables as ColdStartCard["comparables"];
  }

  return patch;
}
