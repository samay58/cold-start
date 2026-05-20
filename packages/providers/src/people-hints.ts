import type { PeopleEmailHint } from "./types";

export type NamedPeopleEmailHint = PeopleEmailHint & { name: string };

function cleanOptional(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function chooseHint(current: NamedPeopleEmailHint | undefined, next: NamedPeopleEmailHint) {
  if (!current) {
    return next;
  }

  const currentScore = Number(Boolean(current.email)) * 4 + Number(Boolean(current.sourceUrl || current.linkedinUrl)) * 2 + Number(Boolean(current.role));
  const nextScore = Number(Boolean(next.email)) * 4 + Number(Boolean(next.sourceUrl || next.linkedinUrl)) * 2 + Number(Boolean(next.role));
  return nextScore > currentScore ? next : current;
}

function assignClean(target: PeopleEmailHint, key: keyof PeopleEmailHint, value: string | null | undefined) {
  const cleaned = cleanOptional(value);
  if (cleaned) {
    target[key] = cleaned;
  }
}

export function normalizeNamedPeopleEmailHints(hints: PeopleEmailHint[]): NamedPeopleEmailHint[] {
  const byName = new Map<string, NamedPeopleEmailHint>();

  for (const hint of hints) {
    const name = cleanOptional(hint.name);
    if (!name) {
      continue;
    }

    const normalized: NamedPeopleEmailHint = { name };
    assignClean(normalized, "id", hint.id);
    assignClean(normalized, "firstName", hint.firstName);
    assignClean(normalized, "lastName", hint.lastName);
    assignClean(normalized, "role", hint.role);
    assignClean(normalized, "email", hint.email);
    assignClean(normalized, "sourceUrl", hint.sourceUrl);
    assignClean(normalized, "linkedinUrl", hint.linkedinUrl);
    const key = name.toLowerCase();
    byName.set(key, chooseHint(byName.get(key), normalized));
  }

  return Array.from(byName.values());
}
