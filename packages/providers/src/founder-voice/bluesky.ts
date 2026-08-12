import { capText } from "./types";
import type { FounderVoiceItem, FounderVoiceLaneResult, FounderVoiceTargets } from "./types";

/*
 * Free, no-auth lane over the public Bluesky AppView API. Actor search by name is loose
 * (common names collide), so an actor is only adopted as the founder when its displayName
 * matches the founder's name AND its bio names the company or domain. A founder with no
 * matching actor contributes zero items; that is a normal empty result, not a failure.
 */

const BLUESKY_SEARCH_URL = "https://public.api.bsky.app/xrpc/app.bsky.actor.searchActors";
const BLUESKY_FEED_URL = "https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed";
const LANE = "bluesky_author_feed" as const;

type BskyActor = {
  did?: string;
  handle?: string;
  displayName?: string;
  description?: string;
};

type BskySearchActorsResponse = {
  actors?: BskyActor[];
};

type BskyFeedEntry = {
  post?: {
    uri?: string;
    record?: { text?: string; createdAt?: string };
  };
};

type BskyAuthorFeedResponse = {
  feed?: BskyFeedEntry[];
};

export async function fetchBlueskyLane(input: {
  targets: FounderVoiceTargets;
  timeoutMs: number;
  fetchFn?: typeof fetch;
}): Promise<FounderVoiceLaneResult> {
  const fetchFn = input.fetchFn ?? fetch;

  try {
    const items: FounderVoiceItem[] = [];
    const failures: string[] = [];

    // Each founder is fetched and caught independently: one founder's actor search or feed
    // fetch failing must not discard items already collected for a sibling founder, and must
    // not skip founders that come after it in the list.
    for (const founder of input.targets.founders) {
      try {
        items.push(...(await founderBlueskyItems(fetchFn, founder.name, input.targets, input.timeoutMs)));
      } catch (error) {
        failures.push(`${founder.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return {
      lane: LANE,
      items,
      estimatedCostUsd: 0,
      ...(failures.length > 0 ? { failure: failures.join("; ") } : {}),
    };
  } catch (error) {
    return { lane: LANE, items: [], estimatedCostUsd: 0, failure: error instanceof Error ? error.message : String(error) };
  }
}

async function founderBlueskyItems(
  fetchFn: typeof fetch,
  founderName: string,
  targets: FounderVoiceTargets,
  timeoutMs: number,
): Promise<FounderVoiceItem[]> {
  const searchPayload = await fetchBlueskyJson<BskySearchActorsResponse>(
    fetchFn,
    `${BLUESKY_SEARCH_URL}?q=${encodeURIComponent(founderName)}&limit=5`,
    timeoutMs,
  );

  const actor = (searchPayload.actors ?? []).find((candidate) => isMatchingFounderActor(candidate, founderName, targets));
  if (!actor?.did || !actor.handle) {
    return [];
  }

  const feedPayload = await fetchBlueskyJson<BskyAuthorFeedResponse>(
    fetchFn,
    `${BLUESKY_FEED_URL}?actor=${encodeURIComponent(actor.did)}&limit=20`,
    timeoutMs,
  );

  const items: FounderVoiceItem[] = [];
  for (const entry of feedPayload.feed ?? []) {
    const text = entry.post?.record?.text?.trim();
    const uri = entry.post?.uri;
    if (!text || !uri) {
      continue;
    }
    const rkey = uri.split("/").pop();
    if (!rkey) {
      continue;
    }

    items.push({
      lane: LANE,
      url: `https://bsky.app/profile/${actor.handle}/post/${rkey}`,
      title: capText(text.split("\n")[0] ?? text),
      text: capText(text),
      authorship: "founder",
      authorName: founderName,
      ...(entry.post?.record?.createdAt ? { publishedAt: entry.post.record.createdAt } : {}),
    });
  }

  return items;
}

async function fetchBlueskyJson<T>(fetchFn: typeof fetch, url: string, timeoutMs: number): Promise<T> {
  const response = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) {
    throw new Error(`Bluesky request failed with ${response.status}`);
  }
  return (await response.json()) as T;
}

function isMatchingFounderActor(actor: BskyActor, founderName: string, targets: FounderVoiceTargets): boolean {
  const displayName = actor.displayName?.trim().toLowerCase();
  if (!displayName || displayName !== founderName.trim().toLowerCase()) {
    return false;
  }

  const description = actor.description?.toLowerCase() ?? "";
  const companyName = targets.companyName.toLowerCase();
  const domain = targets.domain.toLowerCase();
  return description.includes(companyName) || description.includes(domain);
}
