/*
 * Deterministic company email-pattern inference. Given work emails observed in
 * public sources (e.g. GitHub commit authors on a company domain), derive the
 * domain's local-part convention, then construct a likely work email for a named
 * person the pipeline already extracted. This is pure logic with no network or
 * DB; it is the engine behind the free "reachable identity" contact layer.
 *
 * Honesty rule: a constructed address is a guess. Callers must label emails built
 * via applyEmailPattern as inferred, never as observed/verified.
 */

export type EmailPattern = "first.last" | "first" | "flast" | "f.last" | "firstlast";

// Shared inboxes and automation senders. These are real deliverable addresses but
// tell us nothing about the person convention, so they are never pattern anchors.
const ROLE_ALIASES = new Set([
  "support", "hello", "info", "contact", "hi", "hiring", "join", "jobs", "careers",
  "press", "sales", "help", "dev", "devs", "developer", "developers", "team", "admin",
  "noreply", "no-reply", "git", "svc", "github", "security", "billing", "legal",
  "privacy", "abuse", "postmaster", "marketing", "events", "event", "community",
  "feedback", "notifications", "notification", "publisher", "automation", "service",
  "accounts", "account", "circleci", "bot", "build", "release", "infra", "ops", "it",
  "hr", "finance", "opensource", "oss", "engineering", "eng", "founders", "hey"
]);

export function isRoleAlias(localPart: string): boolean {
  const normalized = localPart.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  // Split on the first structural boundary so "support+github" / "svc-autorelease"
  // are caught by their leading token.
  const head = normalized.split(/[+._-]/)[0] ?? normalized;
  return ROLE_ALIASES.has(normalized) || ROLE_ALIASES.has(head);
}

// Fold accents, drop anything that is not a letter, lowercase. "María O'Neil" -> "maria" / "oneil".
function normalizeToken(token: string): string {
  return token
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z]/g, "")
    .toLowerCase();
}

function nameTokens(fullName: string): { first: string; last: string | null } | null {
  const parts = fullName
    .trim()
    .split(/\s+/)
    .map(normalizeToken)
    .filter(Boolean);
  if (parts.length === 0) {
    return null;
  }
  const first = parts[0]!;
  const last = parts.length > 1 ? parts[parts.length - 1]! : null;
  return { first, last };
}

function patternFromAnchor(localPart: string, fullName: string): EmailPattern | null {
  const local = normalizeToken(localPart.split("@")[0] ?? localPart);
  const tokens = nameTokens(fullName);
  if (!local || !tokens) {
    return null;
  }
  const { first, last } = tokens;
  const rawLocal = (localPart.split("@")[0] ?? localPart).toLowerCase();

  if (last) {
    if (rawLocal === `${first}.${last}`) return "first.last";
    if (rawLocal === `${first[0]}.${last}`) return "f.last";
    if (local === `${first[0]}${last}`) return "flast";
    if (local === `${first}${last}`) return "firstlast";
  }
  if (local === first) return "first";
  return null;
}

export function deriveEmailPattern(anchors: { email: string; fullName: string | null }[]): EmailPattern | null {
  const counts = new Map<EmailPattern, number>();
  for (const anchor of anchors) {
    const localPart = anchor.email.split("@")[0] ?? "";
    if (!anchor.fullName || isRoleAlias(localPart)) {
      continue;
    }
    const pattern = patternFromAnchor(anchor.email, anchor.fullName);
    if (pattern) {
      counts.set(pattern, (counts.get(pattern) ?? 0) + 1);
    }
  }
  let best: EmailPattern | null = null;
  let bestCount = 0;
  for (const [pattern, count] of counts) {
    if (count > bestCount) {
      best = pattern;
      bestCount = count;
    }
  }
  return best;
}

export function applyEmailPattern(pattern: EmailPattern, fullName: string, domain: string): string | null {
  const tokens = nameTokens(fullName);
  const cleanDomain = domain.trim().toLowerCase().replace(/^@/, "");
  if (!tokens || !cleanDomain) {
    return null;
  }
  const { first, last } = tokens;

  let local: string | null = null;
  switch (pattern) {
    case "first":
      local = first;
      break;
    case "first.last":
      local = last ? `${first}.${last}` : null;
      break;
    case "f.last":
      local = last ? `${first[0]}.${last}` : null;
      break;
    case "flast":
      local = last ? `${first[0]}${last}` : null;
      break;
    case "firstlast":
      local = last ? `${first}${last}` : null;
      break;
  }
  return local ? `${local}@${cleanDomain}` : null;
}
