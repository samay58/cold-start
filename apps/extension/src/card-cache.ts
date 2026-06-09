import { COLD_START_API_CONTRACT_VERSION, hasUsablePublicProfile, publicCard, type ColdStartCard } from "@cold-start/core";
import type { Settings } from "./extension-config";

const CARD_CACHE_PREFIX = "coldStartCard:";
const LOCAL_CARD_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const LOCAL_CARD_CACHE_FUTURE_SKEW_MS = 5 * 60 * 1000;

type CachedCard = {
  apiOrigin: string;
  card: ColdStartCard;
  contractVersion: string;
  domain: string;
  storedAt: number;
};

type CacheScope = "local" | "session";

function cardCacheKey(domain: string, settings: Pick<Settings, "apiOrigin">) {
  return `${CARD_CACHE_PREFIX}${encodeURIComponent(settings.apiOrigin)}:${encodeURIComponent(domain)}`;
}

function storageArea(scope: CacheScope) {
  return scope === "local" ? chrome.storage.local : chrome.storage.session;
}

function getCachedCard(scope: CacheScope, key: string): Promise<CachedCard | undefined> {
  return new Promise((resolve) => {
    storageArea(scope).get(key, (items) => {
      resolve(items[key] as CachedCard | undefined);
    });
  });
}

function removeCachedCard(scope: CacheScope, key: string): Promise<void> {
  return new Promise((resolve) => {
    storageArea(scope).remove(key, resolve);
  });
}

function setCachedCard(scope: CacheScope, key: string, cached: CachedCard): Promise<void> {
  return new Promise((resolve) => {
    storageArea(scope).set({ [key]: cached }, resolve);
  });
}

function cachedCardIsValid({
  cached,
  domain,
  settings,
  scope
}: {
  cached: CachedCard | undefined;
  domain: string;
  settings: Settings;
  scope: CacheScope;
}) {
  if (
    !cached ||
    cached.domain !== domain ||
    cached.apiOrigin !== settings.apiOrigin ||
    cached.contractVersion !== COLD_START_API_CONTRACT_VERSION ||
    !cached.card ||
    cached.card.domain !== domain
  ) {
    return false;
  }

  if (scope === "local") {
    const storedAt = typeof cached.storedAt === "number" ? cached.storedAt : 0;
    const ageMs = Date.now() - storedAt;
    if (!Number.isFinite(storedAt) || ageMs > LOCAL_CARD_CACHE_TTL_MS || ageMs < -LOCAL_CARD_CACHE_FUTURE_SKEW_MS) {
      return false;
    }
  }

  try {
    return hasUsablePublicProfile(cached.card);
  } catch {
    return false;
  }
}

function durableCardSnapshot(card: ColdStartCard): ColdStartCard {
  return publicCard(card);
}

function cachedCard(domain: string, settings: Settings, card: ColdStartCard): CachedCard {
  return {
    apiOrigin: settings.apiOrigin,
    card,
    contractVersion: COLD_START_API_CONTRACT_VERSION,
    domain,
    storedAt: Date.now()
  };
}

export type CachedCardEntry = {
  card: ColdStartCard;
  /** When this card was stored locally; lets the panel mark a cached read as such. */
  storedAtMs: number;
};

export async function readCachedCard(domain: string, settings: Settings): Promise<CachedCardEntry | null> {
  const key = cardCacheKey(domain, settings);
  const sessionCached = await getCachedCard("session", key);

  if (sessionCached) {
    if (cachedCardIsValid({ cached: sessionCached, domain, settings, scope: "session" })) {
      return { card: sessionCached.card, storedAtMs: sessionCached.storedAt };
    }

    await removeCachedCard("session", key);
  }

  const localCached = await getCachedCard("local", key);
  if (!localCached) {
    return null;
  }

  if (!cachedCardIsValid({ cached: localCached, domain, settings, scope: "local" })) {
    await removeCachedCard("local", key);
    return null;
  }

  await setCachedCard("session", key, localCached);
  return { card: localCached.card, storedAtMs: localCached.storedAt };
}

function removeCachedCardFromAllScopes(key: string): Promise<void> {
  return Promise.all([
    removeCachedCard("session", key),
    removeCachedCard("local", key)
  ]).then(() => undefined);
}

function writeCachedCardToAllScopes(key: string, sessionCached: CachedCard, localCached: CachedCard): Promise<void> {
  return Promise.all([
    setCachedCard("session", key, sessionCached),
    setCachedCard("local", key, localCached)
  ]).then(() => undefined);
}

function getAllCachedKeys(scope: CacheScope): Promise<string[]> {
  return new Promise((resolve) => {
    storageArea(scope).get(null, (items) => {
      resolve(Object.keys(items).filter((key) => key.startsWith(CARD_CACHE_PREFIX)));
    });
  });
}

export function writeCachedCard(domain: string, settings: Settings, card: ColdStartCard): Promise<void> {
  const key = cardCacheKey(domain, settings);
  if (card.domain !== domain || !hasUsablePublicProfile(card)) {
    return removeCachedCardFromAllScopes(key);
  }

  return writeCachedCardToAllScopes(
    key,
    cachedCard(domain, settings, card),
    cachedCard(domain, settings, durableCardSnapshot(card))
  );
}

export async function clearCachedCards(): Promise<void> {
  const [sessionKeys, localKeys] = await Promise.all([
    getAllCachedKeys("session"),
    getAllCachedKeys("local")
  ]);

  await Promise.all([
    sessionKeys.length > 0 ? storageRemove("session", sessionKeys) : Promise.resolve(),
    localKeys.length > 0 ? storageRemove("local", localKeys) : Promise.resolve()
  ]);
}

function storageRemove(scope: CacheScope, keys: string[]): Promise<void> {
  return new Promise((resolve) => {
    storageArea(scope).remove(keys, resolve);
  });
}
