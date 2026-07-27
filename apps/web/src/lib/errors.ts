type ValidationIssue = { path?: Array<string | number>; message?: string };

// Duck-typed rather than instanceof: the error may come from any workspace package's zod
// import, and cross-instance instanceof silently misses.
function validationIssues(error: unknown): ValidationIssue[] | null {
  if (!(error instanceof Error) || error.name !== "ZodError") {
    return null;
  }
  const issues = (error as unknown as { issues?: unknown }).issues;
  return Array.isArray(issues) && issues.length > 0 ? (issues as ValidationIssue[]) : null;
}

// Operator surfaces (the run error column, run-event messages) get prose; the structured
// issue list belongs in the trace via rawErrorDetail. A ZodError's own .message is the JSON
// dump of its issues, which is what the varda failures stored verbatim.
export function boundedErrorMessage(error: unknown, limit = 500): string {
  const issues = validationIssues(error);
  if (issues) {
    const first = issues[0];
    const path = first?.path?.length ? first.path.join(".") : "value";
    const rest = issues.length - 1;
    const suffix = rest > 0 ? ` (+${rest} more issue${rest === 1 ? "" : "s"})` : "";
    return `Validation failed at ${path}: ${first?.message ?? "invalid"}${suffix}`.slice(0, limit);
  }
  const message = error instanceof Error ? error.message : "unknown error";
  return message.slice(0, limit);
}

// Structured detail for the trace failure block. Undefined for errors whose message already
// carries everything, so callers can spread it conditionally.
export function rawErrorDetail(error: unknown): unknown {
  const issues = validationIssues(error);
  return issues ? issues.slice(0, 20) : undefined;
}
