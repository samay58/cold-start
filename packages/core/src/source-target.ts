const companySuffixes = [
  ["artificialintelligence", "Artificial Intelligence"],
  ["technologies", "Technologies"],
  ["technology", "Technology"],
  ["therapeutics", "Therapeutics"],
  ["research", "Research"],
  ["security", "Security"],
  ["systems", "Systems"],
  ["software", "Software"],
  ["robotics", "Robotics"],
  ["medical", "Medical"],
  ["health", "Health"],
  ["cloud", "Cloud"],
  ["finance", "Finance"],
  ["capital", "Capital"],
  ["energy", "Energy"],
  ["labs", "Labs"],
  ["data", "Data"],
  ["tech", "Tech"],
  ["bio", "Bio"],
  ["ai", "AI"],
] as const;

const contextTermsBySuffix: Record<string, string[]> = {
  artificialintelligence: ["artificial intelligence", "ai"],
  therapeutics: ["therapeutics", "therapeutic"],
  research: ["research"],
  security: ["security"],
  systems: ["systems"],
  software: ["software"],
  robotics: ["robotics", "robotic"],
  medical: ["medical", "healthcare", "health care"],
  health: ["health", "healthcare", "health care", "medical"],
  cloud: ["cloud"],
  finance: ["finance", "financial", "fintech"],
  capital: ["capital", "investment", "investor"],
  energy: ["energy"],
  labs: ["labs", "laboratory"],
  data: ["data"],
  tech: ["tech", "technology"],
  bio: ["bio", "biotech", "biology"],
  ai: ["ai", "artificial intelligence"],
};

export function sourceTargetAliasesForDomain(domain: string, companyName?: string | null): string[] {
  const normalizedDomain = normalizeTargetDomain(domain);
  const root = rootLabel(normalizedDomain);
  const aliases = new Set<string>();

  addAlias(aliases, normalizedDomain);
  addAlias(aliases, root);
  addAlias(aliases, companyName);

  if (root.includes("-") || root.includes("_")) {
    addAlias(aliases, titleCase(root.split(/[-_]+/).join(" ")));
  }

  for (const [suffix, label] of companySuffixes) {
    if (!root.endsWith(suffix) || root.length <= suffix.length + 2) {
      continue;
    }

    const stem = root.slice(0, -suffix.length);
    const stemTitle = titleCase(stem);
    addAlias(aliases, `${stemTitle} ${label}`);

    if (stem.length >= 5) {
      addAlias(aliases, stemTitle);
    }
  }

  return Array.from(aliases);
}

export function sourceTargetContextTermsForDomain(domain: string): string[] {
  const root = rootLabel(normalizeTargetDomain(domain));
  const terms = new Set<string>();

  for (const [suffix] of companySuffixes) {
    if (!root.endsWith(suffix) || root.length <= suffix.length + 2) {
      continue;
    }

    for (const term of contextTermsBySuffix[suffix] ?? [suffix]) {
      terms.add(term);
    }
  }

  return Array.from(terms);
}

export function sourceSearchSubjectForDomain(domain: string, companyName?: string | null): string {
  const normalizedDomain = normalizeTargetDomain(domain);
  const aliases = sourceTargetAliasesForDomain(normalizedDomain, companyName)
    .filter((alias) => alias !== normalizedDomain)
    .filter((alias) => !alias.includes("."))
    .filter((alias) => alias !== rootLabel(normalizedDomain))
    .map((alias) => `"${alias}"`);

  return [normalizedDomain, ...aliases].join(" ");
}

export function targetHostMatchesDomain(host: string, domain: string | undefined | null): boolean {
  if (!domain) {
    return false;
  }

  const normalizedHost = normalizeTargetDomain(host);
  const normalizedDomain = normalizeTargetDomain(domain);
  return normalizedHost === normalizedDomain || normalizedHost.endsWith(`.${normalizedDomain}`);
}

function addAlias(aliases: Set<string>, value: string | null | undefined) {
  const cleaned = value?.trim();
  if (cleaned && cleaned.length >= 3) {
    aliases.add(cleaned);
  }
}

function normalizeTargetDomain(value: string) {
  return value
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split("/")[0]
    ?.toLowerCase() ?? "";
}

function rootLabel(host: string) {
  return host.split(".")[0]?.replace(/[^a-z0-9_-]/g, "") ?? "";
}

function titleCase(value: string) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => {
      if (part.toLowerCase() === "ai") {
        return "AI";
      }
      return `${part.charAt(0).toUpperCase()}${part.slice(1)}`;
    })
    .join(" ");
}
