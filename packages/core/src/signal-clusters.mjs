// Corroboration clustering for card signals. One underlying event covered by several outlets
// becomes one signal whose citationIds carry every corroborating source; the UI derives the
// corroboration count from citationIds.length. Plain dependency-free JS so the eval harness
// (node --test, no TS loader) can import the exact same function the pipeline uses.

const SIGNAL_CLUSTER_CAP = 6;
const SIGNAL_CLUSTER_DATE_WINDOW_DAYS = 5;
const TITLE_OVERLAP_THRESHOLD = 0.6;

const STOPWORDS = new Set([
  "a", "an", "and", "as", "at", "after", "by", "for", "from", "how", "in", "into",
  "is", "it", "its", "of", "on", "or", "the", "to", "with", "that", "this", "their"
]);

const RAISE_VERBS = /\b(raises?|raised|raising|lands?|landed|closes?|closed|secures?|secured|nabs?|nabbed|receives?|received|banks?|banked|gets?|got|snags?|snagged)\b/i;

const MONEY_PATTERN = /\$\s?(\d+(?:[.,]\d+)?)\s*(billion|million|thousand|bn|b|m|k)?\b/gi;

function canonicalAmount(rawNumber, rawUnit) {
  const value = Number.parseFloat(rawNumber.replace(/,/g, ""));
  if (!Number.isFinite(value)) {
    return null;
  }
  const unit = (rawUnit ?? "").toLowerCase();
  const multiplier = unit.startsWith("b") ? 1_000_000_000
    : unit.startsWith("m") && unit !== "" ? 1_000_000
    : unit.startsWith("k") || unit === "thousand" ? 1_000
    : 1;
  return String(Math.round(value * multiplier));
}

// Each money mention in a title, classified: a "raise" amount (preceded by a raise verb and not
// labeled a valuation) identifies a funding event on its own; other amounts only corroborate.
function moneyMentions(title) {
  const mentions = [];
  for (const match of title.matchAll(MONEY_PATTERN)) {
    const amount = canonicalAmount(match[1], match[2]);
    if (amount === null) {
      continue;
    }
    const index = match.index ?? 0;
    const before = title.slice(Math.max(0, index - 34), index);
    const after = title.slice(index + match[0].length, index + match[0].length + 18);
    const isValuation = /\bvaluation|valued\b/i.test(after) || /\bvaluation of\s*$/i.test(before);
    mentions.push({
      amount,
      kind: !isValuation && RAISE_VERBS.test(before) ? "raise" : "other"
    });
  }
  return mentions;
}

// Trailing "| Site Name", "- Outlet", and "– tagline" segments are boilerplate, not event
// content: identical taglines across distinct posts otherwise dominate the token overlap
// (DOSS + Campfire and DOSS + Rillet shared "AI-powered finance and operations").
function stripTitleSuffix(title) {
  const stripped = title.replace(/\s+[|–—-]\s+[^|–—]*$/, "");
  return stripped.length >= 10 ? stripped : title;
}

function titleTokens(title, ignoredTerms) {
  const withoutMoney = stripTitleSuffix(title).replace(MONEY_PATTERN, " ");
  const tokens = new Set();
  for (const raw of withoutMoney.toLowerCase().split(/[^a-z0-9]+/)) {
    if (!raw || raw.length < 2 || STOPWORDS.has(raw) || ignoredTerms.has(raw)) {
      continue;
    }
    tokens.add(raw);
  }
  for (const mention of moneyMentions(title)) {
    tokens.add(`$${mention.amount}`);
  }
  return tokens;
}

function parseDateMs(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  const normalized = /^\d{4}-\d{2}$/.test(value) ? `${value}-15` : value;
  const ms = Date.parse(normalized);
  return Number.isNaN(ms) ? null : ms;
}

function datesWithinWindow(leftMs, rightMs, windowDays) {
  if (leftMs === null || rightMs === null) {
    return true;
  }
  return Math.abs(leftMs - rightMs) <= windowDays * 24 * 60 * 60 * 1000;
}

function overlapContainment(left, right) {
  if (left.size === 0 || right.size === 0) {
    return 0;
  }
  let shared = 0;
  for (const token of left) {
    if (right.has(token)) {
      shared += 1;
    }
  }
  return shared / Math.min(left.size, right.size);
}

const SPECIFIC_CATEGORIES = new Set(["funding", "hiring", "launch", "filing", "github"]);

function categoriesCompatible(left, right) {
  if (left === right || !SPECIFIC_CATEGORIES.has(left) || !SPECIFIC_CATEGORIES.has(right)) {
    return true;
  }
  return false;
}

function companyTerms(options) {
  const terms = new Set();
  const candidates = [options.companyName, options.companyDomain?.split(".")[0], options.companyDomain];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") {
      continue;
    }
    for (const token of candidate.toLowerCase().split(/[^a-z0-9]+/)) {
      if (token.length >= 2) {
        terms.add(token);
      }
    }
  }
  return terms;
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function isCompanyAuthored(member, companyDomain) {
  if (!companyDomain) {
    return false;
  }
  const domain = companyDomain.toLowerCase();
  const host = hostOf(member.signal.url);
  return host === domain || host.endsWith(`.${domain}`) || /company\s+(blog|site)/i.test(member.signal.source);
}

function sameEvent(left, right) {
  const sharedAmounts = new Set();
  let sharedRaiseAmount = false;
  for (const mention of left.money) {
    for (const other of right.money) {
      if (mention.amount !== other.amount) {
        continue;
      }
      sharedAmounts.add(mention.amount);
      if (mention.kind === "raise" && other.kind === "raise") {
        sharedRaiseAmount = true;
      }
    }
  }

  // The same disclosed raise amount is event-defining even when an outlet recycles the headline
  // weeks later or mislabels the category (launch coverage that leads with the raise).
  if (sharedRaiseAmount) {
    return true;
  }
  if (sharedAmounts.size > 0 && datesWithinWindow(left.dateMs, right.dateMs, SIGNAL_CLUSTER_DATE_WINDOW_DAYS)) {
    return true;
  }
  return (
    overlapContainment(left.tokens, right.tokens) >= TITLE_OVERLAP_THRESHOLD &&
    datesWithinWindow(left.dateMs, right.dateMs, SIGNAL_CLUSTER_DATE_WINDOW_DAYS) &&
    categoriesCompatible(left.signal.category, right.signal.category)
  );
}

function modalValue(values, fallback) {
  const counts = new Map();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  let best = fallback;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

function clusterRepresentative(members, companyDomain) {
  const modalDate = modalValue(members.map((member) => member.signal.date), members[0].signal.date);
  const modalCategory = modalValue(
    members.map((member) => member.signal.category).filter((category) => SPECIFIC_CATEGORIES.has(category)),
    members[0].signal.category
  );
  const independent = members.filter((member) => !isCompanyAuthored(member, companyDomain));
  const pool = independent.length > 0 ? independent : members;
  const representative = pool.find((member) => member.signal.date === modalDate) ?? pool[0];

  const citationIds = [];
  const seen = new Set();
  for (const member of [representative, ...members]) {
    for (const id of member.signal.citationIds) {
      if (!seen.has(id)) {
        seen.add(id);
        citationIds.push(id);
      }
    }
  }

  return {
    ...representative.signal,
    date: modalDate,
    category: modalCategory,
    citationIds
  };
}

/**
 * Cluster signals that describe the same underlying event into one signal per event, merging
 * citationIds across corroborating coverage. Output is capped and ordered by date descending.
 */
export function clusterSignals(signals, options = {}) {
  if (!Array.isArray(signals) || signals.length === 0) {
    return [];
  }

  const cap = options.cap ?? SIGNAL_CLUSTER_CAP;
  const ignoredTerms = companyTerms(options);
  const members = signals.map((signal) => ({
    signal,
    tokens: titleTokens(signal.title, ignoredTerms),
    money: moneyMentions(signal.title),
    dateMs: parseDateMs(signal.date)
  }));

  const clusters = [];
  for (const member of members) {
    const home = clusters.find((cluster) => cluster.some((existing) => sameEvent(existing, member)));
    if (home) {
      home.push(member);
    } else {
      clusters.push([member]);
    }
  }

  return clusters
    .map((cluster) => clusterRepresentative(cluster, options.companyDomain))
    .sort((left, right) => {
      const leftMs = parseDateMs(left.date);
      const rightMs = parseDateMs(right.date);
      if (leftMs === null && rightMs === null) {
        return 0;
      }
      if (leftMs === null) {
        return 1;
      }
      if (rightMs === null) {
        return -1;
      }
      return rightMs - leftMs;
    })
    .slice(0, cap);
}

/**
 * Redundancy stats for eval scoring: how many distinct events a signal list describes.
 * A ratio of 1 means every emitted signal is a distinct event.
 */
export function signalClusterStats(signals, options = {}) {
  const list = Array.isArray(signals) ? signals : [];
  const events = clusterSignals(list, { ...options, cap: Number.POSITIVE_INFINITY });
  return {
    signalCount: list.length,
    eventCount: events.length,
    distinctEventRatio: list.length > 0 ? Number((events.length / list.length).toFixed(4)) : null
  };
}
