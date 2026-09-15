import { howItWinsStrategyIdSchema, type HowItWinsStrategyId } from "@cold-start/core";

import type { HowItWinsJudgeCallRequest } from "./how-it-wins-judge";

const MAX_DIAGNOSTIC_ISSUES = 12;
const MAX_DIAGNOSTIC_BYTES = 4 * 1024;

const ZOD_ISSUE_CODES = new Set([
  "invalid_type",
  "invalid_literal",
  "unrecognized_keys",
  "invalid_union",
  "invalid_union_discriminator",
  "invalid_enum_value",
  "invalid_arguments",
  "invalid_return_type",
  "invalid_date",
  "invalid_string",
  "too_small",
  "too_big",
  "invalid_intersection_types",
  "not_multiple_of",
  "not_finite",
  "custom"
]);

const SCHEMA_FIELDS = new Set([
  "materialBets",
  "statement",
  "scope",
  "supportingEvidenceIds",
  "scopeReasons",
  "strategyEvaluations",
  "strategyId",
  "disposition",
  "betRefs",
  "mechanism",
  "evidenceGate",
  "evidenceIds",
  "supportingClaims",
  "type",
  "text",
  "bridge",
  "counterevidenceIds",
  "dimensions",
  "evidenceStrength",
  "centrality",
  "materiality",
  "distinctiveness",
  "independence",
  "explanatoryValue",
  "presentRelevance",
  "historicalEvidenceIds",
  "presentEvidenceIds",
  "presentBridge",
  "siblingCandidateIds",
  "siblingResolutions",
  "reason",
  "notYet",
  "precursorEvidenceIds",
  "causalPath",
  "missingCondition",
  "promotionEvidence",
  "horizonMonths",
  "dispositionReason",
  "currentStrategyIds",
  "unusualPair",
  "strategyIds",
  "referenceClass",
  "normalChoice",
  "excludedAlternative",
  "acceptedCost",
  "interaction",
  "copyingDifficulty",
  "openQuestions",
  "question",
  "whyMaterial",
  "evidenceNeeded",
  "affectedStrategyIds",
  "overallWrongCondition",
  "condition",
  "disagreements",
  "stage",
  "summary",
  "material",
  "overrides",
  "kind",
  "from",
  "to",
  "betRevision",
  "findings"
]);

type SupportedZodIssue = {
  code: string;
  path: Array<string | number>;
  expected?: unknown;
  received?: unknown;
  options?: unknown;
  unionErrors?: unknown;
};

type SupportedZodError = {
  name: "ZodError";
  issues: SupportedZodIssue[];
};

export type HowItWinsOutputDiagnostic = {
  stage: HowItWinsJudgeCallRequest["stage"];
  code: string;
  path: string;
  branch?: "compact" | "full" | "open_question";
  expected?: string;
  actualType?: string;
  strategyId?: HowItWinsStrategyId;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function supportedIssue(value: unknown): value is SupportedZodIssue {
  if (!isRecord(value) || typeof value.code !== "string" || !ZOD_ISSUE_CODES.has(value.code)) return false;
  if (!Array.isArray(value.path) || value.path.some((part) => typeof part !== "string" && typeof part !== "number")) {
    return false;
  }
  if (value.code !== "invalid_union") return true;
  return Array.isArray(value.unionErrors)
    && value.unionErrors.length > 0
    && value.unionErrors.every(isSupportedZodError);
}

export function isSupportedZodError(value: unknown): value is SupportedZodError {
  return isRecord(value)
    && value.name === "ZodError"
    && Array.isArray(value.issues)
    && value.issues.length > 0
    && value.issues.every(supportedIssue);
}

function schemaPath(path: Array<string | number>) {
  const safe: string[] = [];
  for (const part of path) {
    if (typeof part === "number" && Number.isSafeInteger(part) && part >= 0) {
      safe.push(String(part));
      continue;
    }
    if (typeof part === "string" && SCHEMA_FIELDS.has(part)) {
      safe.push(part);
      continue;
    }
    break;
  }
  return safe.length > 0 ? safe.join(".") : "root";
}

function safeExpected(issue: SupportedZodIssue) {
  if (typeof issue.expected === "string" && issue.expected.length <= 60) return issue.expected;
  if (Array.isArray(issue.options)) {
    const options = issue.options.filter(
      (option): option is string => typeof option === "string" && option.length <= 40
    ).slice(0, 8);
    if (options.length > 0) return options.join(" | ");
  }
  return undefined;
}

function valueAtPath(candidate: unknown, path: Array<string | number>) {
  let value = candidate;
  for (const part of path) {
    if (typeof part === "number") {
      if (!Array.isArray(value)) return undefined;
      value = value[part];
      continue;
    }
    if (!isRecord(value)) return undefined;
    value = value[part];
  }
  return value;
}

function safeActualType(candidate: unknown, issue: SupportedZodIssue) {
  const value = valueAtPath(candidate, issue.path);
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function strategyIdAtPath(candidate: unknown, path: Array<string | number>) {
  const strategyIndex = path[0] === "strategyEvaluations" && typeof path[1] === "number"
    ? path[1]
    : null;
  if (strategyIndex === null || !isRecord(candidate)) return undefined;
  const rows = candidate.strategyEvaluations;
  const strategyId = Array.isArray(rows) && isRecord(rows[strategyIndex])
    ? rows[strategyIndex].strategyId
    : undefined;
  const parsed = howItWinsStrategyIdSchema.safeParse(strategyId);
  return parsed.success ? parsed.data : undefined;
}

function branchForCandidate(candidate: unknown, path: Array<string | number>) {
  const strategyIndex = path[0] === "strategyEvaluations" && typeof path[1] === "number"
    ? path[1]
    : null;
  if (strategyIndex === null || !isRecord(candidate)) return null;
  const rows = candidate.strategyEvaluations;
  const row = Array.isArray(rows) ? rows[strategyIndex] : undefined;
  if (!isRecord(row)) return null;
  if (["insufficient_evidence", "rejected", "not_applicable"].includes(String(row.disposition))) return 0;
  if (row.disposition !== "open_question") return row.disposition === "current" || row.disposition === "not_yet" ? 1 : null;
  return Object.hasOwn(row, "supportingClaims") || Object.hasOwn(row, "betRefs") ? 1 : 2;
}

function branchName(index: number): HowItWinsOutputDiagnostic["branch"] {
  return (["compact", "full", "open_question"] as const)[index];
}

function leaves(
  issue: SupportedZodIssue,
  candidate: unknown,
  inheritedBranch?: HowItWinsOutputDiagnostic["branch"]
): Array<{ issue: SupportedZodIssue; branch?: HowItWinsOutputDiagnostic["branch"] }> {
  if (issue.code !== "invalid_union" || !Array.isArray(issue.unionErrors)) {
    return [{ issue, ...(inheritedBranch ? { branch: inheritedBranch } : {}) }];
  }
  const compatible = branchForCandidate(candidate, issue.path);
  const selected = compatible === null
    ? issue.unionErrors.slice(0, 3).map((error, index) => ({ error, index }))
    : [{ error: issue.unionErrors[compatible], index: compatible }];
  return selected.flatMap(({ error, index }) => {
    if (!isSupportedZodError(error)) return [];
    const branch = branchName(index);
    return error.issues.flatMap((nested) => leaves(nested, candidate, branch));
  });
}

function diagnosticFor(
  stage: HowItWinsJudgeCallRequest["stage"],
  candidate: unknown,
  leaf: { issue: SupportedZodIssue; branch?: HowItWinsOutputDiagnostic["branch"] }
): HowItWinsOutputDiagnostic {
  const expected = safeExpected(leaf.issue);
  const actualType = safeActualType(candidate, leaf.issue);
  const strategyId = strategyIdAtPath(candidate, leaf.issue.path);
  return {
    stage,
    code: leaf.issue.code,
    path: schemaPath(leaf.issue.path),
    ...(leaf.branch ? { branch: leaf.branch } : {}),
    ...(expected ? { expected } : {}),
    ...(actualType ? { actualType } : {}),
    ...(strategyId ? { strategyId } : {})
  };
}

function withinSerializedLimit(issues: HowItWinsOutputDiagnostic[]) {
  const accepted: HowItWinsOutputDiagnostic[] = [];
  for (const issue of issues.slice(0, MAX_DIAGNOSTIC_ISSUES)) {
    const candidate = [...accepted, issue];
    if (Buffer.byteLength(JSON.stringify(candidate), "utf8") > MAX_DIAGNOSTIC_BYTES) break;
    accepted.push(issue);
  }
  return accepted;
}

export function howItWinsOutputDiagnostics(input: {
  stage: HowItWinsJudgeCallRequest["stage"];
  error: unknown;
  candidate: unknown;
}): HowItWinsOutputDiagnostic[] | null {
  if (!isSupportedZodError(input.error)) return null;
  const diagnostics = input.error.issues.flatMap((issue) => leaves(issue, input.candidate))
    .map((leaf) => diagnosticFor(input.stage, input.candidate, leaf));
  return withinSerializedLimit(diagnostics);
}

export function howItWinsCorrectionFeedback(issues: readonly HowItWinsOutputDiagnostic[]) {
  return `Return one complete corrected global_judge result. Validation issues: ${JSON.stringify(issues)}`;
}
