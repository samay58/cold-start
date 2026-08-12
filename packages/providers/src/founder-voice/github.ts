import { capText } from "./types";
import type { FounderVoiceItem, FounderVoiceLaneResult, FounderVoiceTargets } from "./types";

/*
 * Free lane over the public GitHub REST API, keyed off each founder's own githubUrl
 * (not the company org, which packages/providers/src/github-contacts.ts already covers
 * for email harvesting). Reads recent repo descriptions and public event activity as
 * founder voice: pushed commit messages, releases, and issues the founder authored.
 */

const GITHUB_API_VERSION = "2022-11-28";
const MAX_EVENT_ITEMS_PER_FOUNDER = 10;
const LANE = "github_author_activity" as const;

type GithubRepo = {
  name?: string;
  description?: string | null;
  html_url?: string;
};

type GithubEventPayload = {
  commits?: Array<{ sha?: string; message?: string }>;
  release?: { tag_name?: string; name?: string; html_url?: string };
  issue?: { title?: string; html_url?: string };
};

type GithubEvent = {
  type?: string;
  created_at?: string | null;
  repo?: { name?: string };
  payload?: GithubEventPayload;
};

export async function fetchGithubLane(input: {
  targets: FounderVoiceTargets;
  githubToken?: string;
  timeoutMs: number;
  fetchFn?: typeof fetch;
}): Promise<FounderVoiceLaneResult> {
  const fetchFn = input.fetchFn ?? fetch;

  try {
    const headers: Record<string, string> = { "X-GitHub-Api-Version": GITHUB_API_VERSION };
    if (input.githubToken) {
      headers.Authorization = `Bearer ${input.githubToken}`;
    }

    const items: FounderVoiceItem[] = [];
    const failures: string[] = [];

    // Each founder is fetched and caught independently: one founder's account being gone
    // (404) or rate-limited must not discard items already collected for a sibling founder,
    // and must not skip founders that come after it in the list.
    for (const founder of input.targets.founders) {
      const username = githubUsernameFromUrl(founder.githubUrl);
      if (!username) {
        continue;
      }

      try {
        items.push(...(await founderGithubItems(fetchFn, headers, username, founder.name, input.timeoutMs)));
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

async function founderGithubItems(
  fetchFn: typeof fetch,
  headers: Record<string, string>,
  username: string,
  founderName: string,
  timeoutMs: number,
): Promise<FounderVoiceItem[]> {
  const [repos, events] = await Promise.all([
    fetchGithubJson<GithubRepo[]>(
      fetchFn,
      `https://api.github.com/users/${username}/repos?sort=pushed&per_page=5`,
      headers,
      timeoutMs,
    ),
    fetchGithubJson<GithubEvent[]>(
      fetchFn,
      `https://api.github.com/users/${username}/events/public?per_page=30`,
      headers,
      timeoutMs,
    ),
  ]);

  const items: FounderVoiceItem[] = [];

  for (const repo of repos) {
    const description = repo.description?.trim();
    if (!repo.name || !description) {
      continue;
    }
    items.push({
      lane: LANE,
      url: repo.html_url ?? `https://github.com/${username}/${repo.name}`,
      title: capText(repo.name),
      text: capText(description),
      authorship: "founder",
      authorName: founderName,
    });
  }

  let eventItemCount = 0;
  for (const event of events) {
    if (eventItemCount >= MAX_EVENT_ITEMS_PER_FOUNDER) {
      break;
    }
    for (const item of itemsFromGithubEvent(event, username, founderName)) {
      if (eventItemCount >= MAX_EVENT_ITEMS_PER_FOUNDER) {
        break;
      }
      items.push(item);
      eventItemCount += 1;
    }
  }

  return items;
}

async function fetchGithubJson<T>(
  fetchFn: typeof fetch,
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<T> {
  const response = await fetchFn(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) {
    throw new Error(`GitHub request failed with ${response.status}`);
  }
  return (await response.json()) as T;
}

function itemsFromGithubEvent(event: GithubEvent, username: string, founderName: string): FounderVoiceItem[] {
  const publishedAt = event.created_at ? { publishedAt: event.created_at } : {};

  if (event.type === "PushEvent") {
    return (event.payload?.commits ?? []).flatMap((commit) => {
      const message = commit.message?.trim();
      if (!message) {
        return [];
      }
      const firstLine = message.split("\n")[0] ?? message;
      const url =
        commit.sha && event.repo?.name
          ? `https://github.com/${event.repo.name}/commit/${commit.sha}`
          : `https://github.com/${username}`;
      return [
        {
          lane: LANE,
          url,
          title: capText(firstLine),
          text: capText(message),
          authorship: "founder" as const,
          authorName: founderName,
          ...publishedAt,
        },
      ];
    });
  }

  if (event.type === "ReleaseEvent") {
    const release = event.payload?.release;
    const title = release?.name?.trim() || release?.tag_name?.trim();
    if (!title) {
      return [];
    }
    return [
      {
        lane: LANE,
        url: release?.html_url ?? `https://github.com/${username}`,
        title: capText(title),
        text: capText(title),
        authorship: "founder",
        authorName: founderName,
        ...publishedAt,
      },
    ];
  }

  if (event.type === "IssuesEvent") {
    const title = event.payload?.issue?.title?.trim();
    if (!title) {
      return [];
    }
    return [
      {
        lane: LANE,
        url: event.payload?.issue?.html_url ?? `https://github.com/${username}`,
        title: capText(title),
        text: capText(title),
        authorship: "founder",
        authorName: founderName,
        ...publishedAt,
      },
    ];
  }

  return [];
}

function githubUsernameFromUrl(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }
  try {
    const parsed = new URL(url);
    const segment = parsed.pathname.split("/").filter(Boolean)[0];
    return segment && segment.length > 0 ? segment : null;
  } catch {
    return null;
  }
}
