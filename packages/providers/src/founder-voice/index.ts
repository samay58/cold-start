import type { DirectExaEnv } from "../types";
import { providerBudgetRegistry } from "../provider-budget";
import { fetchBlueskyLane } from "./bluesky";
import { fetchExaWebLane } from "./exa-web";
import { fetchGithubLane } from "./github";
import { fetchHnLane } from "./hn";
import { fetchXaiXSearchLane } from "./xai-x-search";
import type { FounderVoiceItem, FounderVoiceLaneName, FounderVoiceLaneResult, FounderVoiceTargets } from "./types";

// Runs the five founder-voice evidence lanes (three free, two paid), tolerating any lane
// failing without failing the run: no lane throws on its own, and this orchestrator does
// not either. Each lane's timeout comes from providerBudgetRegistry.founderVoice so the
// budget registry stays the single source of truth for per-lane timing and cost.
export const FOUNDER_VOICE_MAX_ITEMS = 40;

export type FounderVoiceLaneFns = {
  hn: (input: { targets: FounderVoiceTargets; timeoutMs: number }) => Promise<FounderVoiceLaneResult>;
  github: (input: { targets: FounderVoiceTargets; githubToken?: string; timeoutMs: number }) => Promise<FounderVoiceLaneResult>;
  bluesky: (input: { targets: FounderVoiceTargets; timeoutMs: number }) => Promise<FounderVoiceLaneResult>;
  xai: (input: { targets: FounderVoiceTargets; xaiApiKey?: string; timeoutMs: number }) => Promise<FounderVoiceLaneResult>;
  exaWeb: (input: { targets: FounderVoiceTargets; directExaEnv: DirectExaEnv; timeoutMs: number }) => Promise<FounderVoiceLaneResult>;
};

const defaultLaneFns: FounderVoiceLaneFns = {
  hn: fetchHnLane,
  github: fetchGithubLane,
  bluesky: fetchBlueskyLane,
  xai: fetchXaiXSearchLane,
  exaWeb: fetchExaWebLane,
};

const LANE_ORDER: FounderVoiceLaneName[] = [
  "hn_search",
  "github_author_activity",
  "bluesky_author_feed",
  "xai_x_search",
  "exa_founder_web",
];

export async function fetchFounderVoiceEvidence(input: {
  targets: FounderVoiceTargets;
  env: { xaiApiKey?: string; githubToken?: string; directExa: DirectExaEnv };
  lanes?: FounderVoiceLaneFns;
}): Promise<{ laneResults: FounderVoiceLaneResult[]; items: FounderVoiceItem[]; estimatedCostUsd: number }> {
  const lanes = input.lanes ?? defaultLaneFns;
  const budgets = providerBudgetRegistry.founderVoice;

  const settled = await Promise.allSettled([
    lanes.hn({ targets: input.targets, timeoutMs: budgets.hn_search.timeoutMs }),
    lanes.github({
      targets: input.targets,
      ...(input.env.githubToken ? { githubToken: input.env.githubToken } : {}),
      timeoutMs: budgets.github_author_activity.timeoutMs,
    }),
    lanes.bluesky({ targets: input.targets, timeoutMs: budgets.bluesky_author_feed.timeoutMs }),
    lanes.xai({
      targets: input.targets,
      ...(input.env.xaiApiKey ? { xaiApiKey: input.env.xaiApiKey } : {}),
      timeoutMs: budgets.xai_x_search.timeoutMs,
    }),
    lanes.exaWeb({ targets: input.targets, directExaEnv: input.env.directExa, timeoutMs: budgets.exa_founder_web.timeoutMs }),
  ]);

  const laneResults: FounderVoiceLaneResult[] = settled.map((result, index) => {
    const laneName = LANE_ORDER[index]!;
    if (result.status === "fulfilled") {
      return result.value;
    }
    return {
      lane: laneName,
      items: [],
      estimatedCostUsd: 0,
      failure: result.reason instanceof Error ? result.reason.message : String(result.reason),
    };
  });

  const estimatedCostUsd = Number(
    laneResults.reduce((sum, lane) => sum + lane.estimatedCostUsd, 0).toFixed(4),
  );
  const items = capItemsAcrossLanes(laneResults, FOUNDER_VOICE_MAX_ITEMS);

  return { laneResults, items, estimatedCostUsd };
}

// Caps the combined item count, dropping overflow from the currently-largest lane first
// (repeatedly), so no single noisy lane (github routinely returns the most items) can
// crowd out every other lane's evidence.
function capItemsAcrossLanes(laneResults: FounderVoiceLaneResult[], maxTotal: number): FounderVoiceItem[] {
  const buckets = laneResults.map((lane) => [...lane.items]);
  let total = buckets.reduce((sum, bucket) => sum + bucket.length, 0);

  while (total > maxTotal) {
    let largestIndex = 0;
    for (let i = 1; i < buckets.length; i += 1) {
      if (buckets[i]!.length > buckets[largestIndex]!.length) {
        largestIndex = i;
      }
    }
    buckets[largestIndex]!.pop();
    total -= 1;
  }

  return buckets.flat();
}
