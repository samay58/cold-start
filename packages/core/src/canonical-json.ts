// Every JSON-keyed hash in the repo (judge memo keys, job checkpoints) serializes through this function.
// Keys sort by code unit rather than locale, so the hash is identical on every machine.

type JsonPrimitive = string | number | boolean | null;
export type CanonicalJsonValue = JsonPrimitive | CanonicalJsonValue[] | { [key: string]: CanonicalJsonValue };

export function canonicalJsonValue(value: unknown): CanonicalJsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("canonical JSON input contains a non-finite number");
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (typeof value === "object") {
    const out: Record<string, CanonicalJsonValue> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const item = (value as Record<string, unknown>)[key];
      if (item !== undefined) out[key] = canonicalJsonValue(item);
    }
    return out;
  }
  throw new Error(`canonical JSON input contains unsupported type: ${typeof value}`);
}

export function canonicalJsonString(value: unknown): string {
  return JSON.stringify(canonicalJsonValue(value));
}
