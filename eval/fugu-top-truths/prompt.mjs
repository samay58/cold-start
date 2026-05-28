import { createHash } from "node:crypto";

const REQUIRED_PROMPT = `Using only this frozen source bundle, identify the 5 truths that matter most about this company.

I want:

1. The 5 truths in rank order
2. Why each truth earned that rank
3. Which tempting claims were excluded and why
4. Where the evidence is strong
5. Where the evidence is conflicted or weak
6. The single hardest conflict to resolve

Do not optimize for prose. Optimize for judgment, support, and ranking discipline.`;

export function normalizeSourceBundle(bundle) {
  if (!bundle || typeof bundle !== "object") {
    throw new Error("source bundle must be an object");
  }
  const company = bundle.company ?? {};
  const sources = Array.isArray(bundle.sources) ? bundle.sources : [];

  return {
    company: {
      name: String(company.name ?? "").trim(),
      domain: String(company.domain ?? "").trim(),
      ...(company.category ? { category: String(company.category).trim() } : {}),
    },
    sources: sources.map((source, index) => ({
      id: String(source.id ?? `e${index + 1}`).trim(),
      title: String(source.title ?? source.url ?? "").trim(),
      url: String(source.url ?? "").trim(),
      sourceType: String(source.sourceType ?? "other").trim(),
      authorityScore: Number.isFinite(Number(source.authorityScore)) ? Number(source.authorityScore) : 0,
      ...(source.publishedAt ? { publishedAt: String(source.publishedAt).trim() } : {}),
      ...(source.fetchedAt ? { fetchedAt: String(source.fetchedAt).trim() } : {}),
      text: String(source.text ?? source.snippet ?? source.rawText ?? "").replace(/\s+/g, " ").trim(),
    })),
  };
}

export function hashJson(value) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

export function buildTopTruthsPrompt(bundle) {
  const normalized = normalizeSourceBundle(bundle);
  return [
    REQUIRED_PROMPT,
    "",
    "Return strict JSON only. Do not wrap it in Markdown.",
    "",
    "JSON schema:",
    JSON.stringify(
      {
        truths: [
          {
            rank: 1,
            truth: "string",
            whyRanked: "string",
            evidenceStrong: ["string"],
            evidenceWeakOrConflicted: ["string"],
            sourceIds: ["e1"],
          },
        ],
        excludedClaims: [{ claim: "string", whyExcluded: "string", sourceIds: ["e1"] }],
        evidenceStrong: ["string"],
        evidenceConflictedOrWeak: ["string"],
        hardestConflict: { conflict: "string", whyHard: "string", workingResolution: "string" },
      },
      null,
      2,
    ),
    "",
    "Rules:",
    "- Use exactly 5 truths.",
    "- Ranks must be 1 through 5 with no ties.",
    "- Every truth needs at least one source id.",
    "- Exclude tempting claims even if they sound useful when the source bundle does not support them cleanly.",
    "- Preserve unresolved conflicts. Do not average contradictory evidence into false certainty.",
    "- Keep prose tight. Long explanation is not a substitute for judgment.",
    "",
    "SOURCE_BUNDLE_JSON:",
    JSON.stringify(normalized, null, 2),
  ].join("\n");
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
