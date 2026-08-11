export const MAX_EXTERNAL_URL_LENGTH = 2_048;

export function safeWebUrl(value: unknown): string | null {
  return safeUrl(value, false);
}

export function safePublicImageUrl(value: unknown): string | null {
  const url = safeUrl(value, true);
  if (!url) return null;

  const hostname = new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (
    isIpLiteral(hostname) ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".home.arpa") ||
    hostname.endsWith(".test") ||
    hostname.endsWith(".invalid") ||
    hostname.endsWith(".example") ||
    hostname === "onion" ||
    hostname.endsWith(".onion") ||
    !hostname.includes(".")
  ) {
    return null;
  }

  return url;
}

function safeUrl(value: unknown, httpsOnly: boolean): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_EXTERNAL_URL_LENGTH) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.username || parsed.password) return null;
    if (httpsOnly ? parsed.protocol !== "https:" : parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return trimmed;
  } catch {
    return null;
  }
}

function isIpLiteral(hostname: string): boolean {
  if (hostname.includes(":")) return true;
  const octets = hostname.split(".");
  return octets.length === 4 && octets.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}
