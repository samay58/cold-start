import type { ColdStartCard } from "@cold-start/core";

export function websiteLabel(card: ColdStartCard) {
  const website = card.identity.websiteUrl?.value ?? `https://${card.domain}`;
  try {
    return new URL(website).hostname.replace(/^www\./i, "");
  } catch {
    return card.domain;
  }
}

export function readableCompanyName(card: ColdStartCard) {
  const extracted = card.identity.name.value?.trim();
  if (extracted && extracted.toLowerCase() !== card.domain.toLowerCase()) {
    return extracted;
  }

  const root = card.domain.replace(/^www\./i, "").split(".")[0] ?? card.domain;
  return root
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ") || card.domain;
}
