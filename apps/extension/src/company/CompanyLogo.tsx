import { useEffect, useMemo, useState } from "react";

function cleanDomain(input: string) {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) {
    return "";
  }

  try {
    const parsed = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return trimmed.replace(/^https?:\/\//, "").split("/")[0]?.replace(/^www\./, "") ?? "";
  }
}

function safeLogoUrl(input: string | null | undefined) {
  if (!input) {
    return null;
  }

  try {
    const url = new URL(input);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

const LOGO_CACHE_PREFIX = "coldStartLogo:";

function logoCacheKey(domain: string) {
  return `${LOGO_CACHE_PREFIX}${encodeURIComponent(cleanDomain(domain))}`;
}

function logoCandidates(domain: string, logoUrl?: string | null, cachedLogoUrl?: string | null) {
  const host = cleanDomain(domain);
  const savedLogo = safeLogoUrl(logoUrl);
  const cachedLogo = safeLogoUrl(cachedLogoUrl);
  const candidates = [savedLogo, cachedLogo].filter((candidate): candidate is string => Boolean(candidate));

  if (host) {
    candidates.push(`https://icons.duckduckgo.com/ip3/${host}.ico`);
    candidates.push(`https://${host}/favicon.ico`);
  }

  return Array.from(new Set(candidates));
}

function initialFor(label: string) {
  return label.trim().charAt(0).toUpperCase() || "·";
}

export function CompanyLogo({
  className,
  domain,
  label,
  logoUrl
}: {
  className?: string;
  domain: string;
  label: string;
  logoUrl?: string | null | undefined;
}) {
  const [cachedLogoUrl, setCachedLogoUrl] = useState<string | null>(null);
  const candidates = useMemo(() => logoCandidates(domain, logoUrl, cachedLogoUrl), [cachedLogoUrl, domain, logoUrl]);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const src = candidates[candidateIndex] ?? null;
  const classes = ["cs-company-logo-mark", className].filter(Boolean).join(" ");

  useEffect(() => {
    setCandidateIndex(0);
    setLoaded(false);
  }, [candidates]);

  useEffect(() => {
    const key = logoCacheKey(domain);
    chrome.storage.session.get(key, (items) => {
      setCachedLogoUrl(typeof items[key] === "string" ? items[key] : null);
    });
  }, [domain]);

  return (
    <span aria-label={`${label} logo`} className={classes} data-loaded={loaded ? "true" : "false"} role="img">
      <span aria-hidden="true" className="cs-company-logo-fallback">{initialFor(label)}</span>
      {src ? (
        <img
          alt=""
          decoding="async"
          loading="lazy"
          onError={() => {
            setLoaded(false);
            setCandidateIndex((index) => index + 1);
          }}
          onLoad={() => {
            setLoaded(true);
            if (src) {
              chrome.storage.session.set({ [logoCacheKey(domain)]: src });
            }
          }}
          src={src}
        />
      ) : null}
    </span>
  );
}
