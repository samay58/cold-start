export function boundedErrorMessage(error: unknown, limit = 500): string {
  const message = error instanceof Error ? error.message : "unknown error";
  return message.slice(0, limit);
}
