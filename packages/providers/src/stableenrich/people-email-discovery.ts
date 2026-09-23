// Per-leader email discovery summary for the generation trace: where each leader was found, which
// email was accepted and from what source, and every Hunter verification attempt.
import type { SecFormDOfficer } from "../sec-edgar";
import { integerValue, objectRecord, stringValue, workEmailValue } from "../stableenrich-utils";
import { type StableenrichEmailDiscovery, type StableenrichProbeResult, fullName } from "./core";
import { type PersonRecord, extractPeopleRecords, hunterVerificationAccepted } from "./people";

export function summarizeEmailDiscovery(
  leaders: PersonRecord[],
  results: PromiseSettledResult<StableenrichProbeResult>[],
  context: { secOfficers?: SecFormDOfficer[]; exaPeople?: PersonRecord[] } = {},
): StableenrichEmailDiscovery[] {
  if (leaders.length === 0) {
    return [];
  }

  const domain = results.flatMap((result) =>
    result.status === "fulfilled" && result.value.metadata?.domain ? [result.value.metadata.domain] : [],
  )[0];
  const secNames = new Set(
    (context.secOfficers ?? []).map((officer) => officer.fullName.toLowerCase().trim()),
  );
  const exaNames = new Set(
    (context.exaPeople ?? [])
      .map((person) => (person.name ?? fullName(person.firstName, person.lastName) ?? "").toLowerCase().trim())
      .filter((name) => name.length > 0),
  );
  const exaEmailsByName = new Map(
    (context.exaPeople ?? [])
      .flatMap((person): Array<[string, string]> => {
        const email = workEmailValue(person.email, domain);
        if (!email) {
          return [];
        }
        const name = (person.name ?? fullName(person.firstName, person.lastName) ?? "").toLowerCase().trim();
        return name ? [[name, email]] : [];
      })
  );

  const entries = new Map<string, StableenrichEmailDiscovery>();
  for (const leader of leaders) {
    const name = leader.name ?? fullName(leader.firstName, leader.lastName);
    if (!name) {
      continue;
    }
    const key = name.toLowerCase().trim();
    if (entries.has(key)) {
      continue;
    }
    const discoverySource: StableenrichEmailDiscovery["discoverySource"] = secNames.has(key)
      ? "sec_edgar"
      : exaNames.has(key)
        ? "exa"
        : "apollo";
    const exaEmail = exaEmailsByName.get(key) ?? null;
    const leaderEmail = workEmailValue(leader.email, domain);
    const seedEmail = leaderEmail ?? exaEmail;
    const seedSource: StableenrichEmailDiscovery["emailSource"] = leaderEmail
      ? "apollo_search"
      : exaEmail
        ? "exa"
        : null;
    entries.set(key, {
      name,
      role: leader.role ?? null,
      discoverySource,
      emailFound: seedEmail ?? null,
      emailSource: seedSource,
      hunterAttempts: [],
    });
  }

  const upgradeWithEmail = (
    nameKey: string,
    email: string,
    source: StableenrichEmailDiscovery["emailSource"],
  ) => {
    const entry = entries.get(nameKey);
    if (!entry || entry.emailFound) {
      return;
    }
    entry.emailFound = email;
    entry.emailSource = source;
  };

  for (const result of results) {
    if (result.status !== "fulfilled") {
      continue;
    }
    const probe = result.value;
    if (probe.name === "apollo_people_enrich" || probe.name === "minerva_enrich" || probe.name === "clado_contacts_enrich") {
      const people = extractPeopleRecords(probe.result);
      const source: StableenrichEmailDiscovery["emailSource"] =
        probe.name === "apollo_people_enrich" ? "apollo_enrich" : probe.name === "minerva_enrich" ? "minerva" : "clado";
      for (const person of people) {
        const email = workEmailValue(person.email, probe.metadata?.domain);
        if (!email) {
          continue;
        }
        const name = person.name ?? fullName(person.firstName, person.lastName) ?? probe.metadata?.personName;
        if (!name) {
          continue;
        }
        upgradeWithEmail(name.toLowerCase().trim(), email, source);
      }
      continue;
    }
    if (probe.name === "hunter_email_verifier") {
      const personName = probe.metadata?.personName;
      const email = workEmailValue(probe.metadata?.email, probe.metadata?.domain);
      if (!personName || !email) {
        continue;
      }
      const key = personName.toLowerCase().trim();
      const entry = entries.get(key);
      if (!entry) {
        continue;
      }
      const record = objectRecord(probe.result);
      const status = stringValue(record?.status)?.toLowerCase() ?? null;
      const score = integerValue(record?.score);
      const accepted = hunterVerificationAccepted(probe.result);
      entry.hunterAttempts = entry.hunterAttempts ?? [];
      entry.hunterAttempts.push({ email, status, score, accepted });
      if (accepted && !entry.emailFound) {
        entry.emailFound = email;
        entry.emailSource = "hunter";
      }
    }
  }

  return Array.from(entries.values()).map((entry) => {
    const { hunterAttempts, ...rest } = entry;
    return hunterAttempts && hunterAttempts.length > 0 ? { ...rest, hunterAttempts } : rest;
  });
}

