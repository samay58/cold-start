import { COLD_START_API_CONTRACT_VERSION, type ColdStartCard } from "@cold-start/core";
import type { Settings } from "./extension-config";

const CARD_CACHE_PREFIX = "coldStartCard:";

type CachedCard = {
  apiOrigin: string;
  card: ColdStartCard;
  contractVersion: string;
  domain: string;
  storedAt: number;
};

export function cardCacheKey(domain: string, settings: Pick<Settings, "apiOrigin">) {
  return `${CARD_CACHE_PREFIX}${encodeURIComponent(settings.apiOrigin)}:${encodeURIComponent(domain)}`;
}

export function readCachedCard(domain: string, settings: Settings): Promise<ColdStartCard | null> {
  const key = cardCacheKey(domain, settings);
  return new Promise((resolve) => {
    chrome.storage.session.get(key, (items) => {
      const cached = items[key] as CachedCard | undefined;
      if (
        !cached ||
        cached.domain !== domain ||
        cached.apiOrigin !== settings.apiOrigin ||
        cached.contractVersion !== COLD_START_API_CONTRACT_VERSION ||
        !cached.card
      ) {
        resolve(null);
        return;
      }

      resolve(cached.card);
    });
  });
}

export function writeCachedCard(domain: string, settings: Settings, card: ColdStartCard): Promise<void> {
  const key = cardCacheKey(domain, settings);
  const cached: CachedCard = {
    apiOrigin: settings.apiOrigin,
    card,
    contractVersion: COLD_START_API_CONTRACT_VERSION,
    domain,
    storedAt: Date.now()
  };

  return new Promise((resolve) => {
    chrome.storage.session.set({ [key]: cached }, resolve);
  });
}

export function clearCachedCards(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.session.get(null, (items) => {
      const keys = Object.keys(items).filter((key) => key.startsWith(CARD_CACHE_PREFIX));
      if (keys.length === 0) {
        resolve();
        return;
      }

      chrome.storage.session.remove(keys, resolve);
    });
  });
}
