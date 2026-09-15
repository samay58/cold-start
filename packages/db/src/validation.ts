export function assertSha256Hex(value: string, field: string) {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new TypeError(`${field} must be a lowercase SHA-256 hex digest`);
  }
}

export function assertPositiveInteger(value: number, field: string) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${field} must be a positive integer`);
  }
}

export function assertNonNegativeInteger(value: number, field: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${field} must be a non-negative integer`);
  }
}

export function nonNegativeInteger(value: number, field: string) {
  assertNonNegativeInteger(value, field);
  return value;
}

export function nullableNonNegativeInteger(value: number | null, field: string) {
  return value === null ? null : nonNegativeInteger(value, field);
}

export function assertNonemptyString(value: string, field: string, max: number) {
  if (!value.trim() || value.length > max) throw new Error(`${field} must contain 1-${max} characters`);
}

export function assertJsonBytes(value: unknown, limit: number, label: string) {
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > limit) throw new Error(`${label} exceeds ${limit} bytes`);
}

export function boundedString(value: string, max: number) {
  return value.slice(0, max);
}

export function nullableBoundedString(value: string | null, max: number) {
  return value === null ? null : boundedString(value, max);
}

export function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function jsonRoundTrip(value: unknown): unknown {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new Error("Value is not JSON serializable");
  return JSON.parse(serialized) as unknown;
}

export function safeIntegerFromSql(value: unknown, field: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error(`${field} from the database is not a non-negative safe integer`);
  return number;
}

export function dateFromSql(value: Date | string | undefined): Date {
  if (!value) throw new TypeError("database timestamp is missing");
  return value instanceof Date ? value : new Date(value);
}

export function booleanFromSql(value: boolean | string): boolean {
  return value === true || value === "true" || value === "t";
}
