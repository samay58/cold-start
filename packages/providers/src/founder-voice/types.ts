// Shared types for the free founder-voice evidence lanes (HN, GitHub, Bluesky, and the
// paid xAI/Exa lanes added later). Deliberately import-free: providers stays card-free,
// so callers in @cold-start/pipeline and @cold-start/llm pass plain targets in.

export type FounderVoiceLaneName =
  | "hn_search"
  | "github_author_activity"
  | "bluesky_author_feed"
  | "xai_x_search"
  | "exa_founder_web";

export type FounderVoiceItem = {
  lane: FounderVoiceLaneName;
  url: string;
  title: string;
  text: string;
  authorship: "founder" | "company" | "third_party";
  authorName?: string;
  publishedAt?: string;
};

export type FounderVoiceLaneResult = {
  lane: FounderVoiceLaneName;
  items: FounderVoiceItem[];
  estimatedCostUsd: number;
  failure?: string;
};

export type FounderVoiceTargets = {
  companyName: string;
  domain: string;
  founders: Array<{ name: string; xUrl?: string | null; githubUrl?: string | null }>;
};

// Every lane trims and caps its title/text fields at 1,000 chars before returning items,
// so downstream synthesis never has to defend against an unbounded evidence blob.
export function capText(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 1000 ? trimmed.slice(0, 1000) : trimmed;
}
