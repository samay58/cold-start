import { eq } from "drizzle-orm";

import { publicCard, type ColdStartCard, type ResolvedFact } from "@cold-start/core";

import type { ColdStartDb } from "../client";
import { citations, claims } from "../schema";

type PublicClaim = {
  path: string;
  fact: ResolvedFact<unknown>;
};

export async function recordCardEvidence(db: ColdStartDb, cardId: string, card: ColdStartCard) {
  const publicOnly = publicCard(card);
  const publicClaims: PublicClaim[] = [
    { path: "identity.name", fact: publicOnly.identity.name },
    ...(publicOnly.identity.websiteUrl ? [{ path: "identity.websiteUrl", fact: publicOnly.identity.websiteUrl }] : []),
    ...(publicOnly.identity.linkedinUrl ? [{ path: "identity.linkedinUrl", fact: publicOnly.identity.linkedinUrl }] : []),
    { path: "identity.oneLiner", fact: publicOnly.identity.oneLiner },
    ...(publicOnly.identity.description ? [{ path: "identity.description", fact: publicOnly.identity.description }] : []),
    { path: "identity.hq", fact: publicOnly.identity.hq },
    { path: "identity.foundedYear", fact: publicOnly.identity.foundedYear },
    { path: "funding.totalRaisedUsd", fact: publicOnly.funding.totalRaisedUsd },
    { path: "funding.lastRound", fact: publicOnly.funding.lastRound },
    { path: "funding.investors", fact: publicOnly.funding.investors },
    { path: "team.founders", fact: publicOnly.team.founders },
    { path: "team.keyExecs", fact: publicOnly.team.keyExecs },
    { path: "team.headcount", fact: publicOnly.team.headcount }
  ];
  const claimValues = publicClaims.map(({ path, fact }) => ({
    cardId,
    path,
    visibility: "public" as const,
    status: fact.status,
    confidence: fact.confidence,
    valueJson: fact.value,
    citationKeys: fact.citationIds
  }));
  const citationValues = publicOnly.citations.map((citation) => ({
    cardId,
    citationKey: citation.id,
    url: citation.url,
    title: citation.title,
    sourceType: citation.sourceType,
    ...(citation.snippet !== undefined ? { snippet: citation.snippet } : {}),
    fetchedAt: new Date(citation.fetchedAt)
  }));

  function buildWrites(adapter: ColdStartDb) {
    return [
      adapter.delete(citations).where(eq(citations.cardId, cardId)),
      adapter.delete(claims).where(eq(claims.cardId, cardId)),
      ...(citationValues.length > 0 ? [adapter.insert(citations).values(citationValues)] : []),
      adapter.insert(claims).values(claimValues)
    ];
  }

  if ("batch" in db && typeof db.batch === "function") {
    await db.batch(buildWrites(db) as never);
    return;
  }

  if ("transaction" in db && typeof db.transaction === "function") {
    await db.transaction(async (tx) => {
      for (const write of buildWrites(tx as unknown as ColdStartDb)) {
        await write;
      }
    });
    return;
  }

  throw new Error("Database adapter must support batch or transaction writes");
}
