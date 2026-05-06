import { canonicalDomain } from "@cold-start/core";

const localSuffixes = [".local", ".internal", ".test", ".invalid", ".localhost"];

function isIpv4Address(domain: string): boolean {
  const parts = domain.split(".");

  return (
    parts.length === 4 &&
    parts.every((part) => {
      if (!/^\d{1,3}$/.test(part)) {
        return false;
      }

      const value = Number(part);
      return value >= 0 && value <= 255;
    })
  );
}

function isIpLiteral(domain: string): boolean {
  const withoutIpv6Brackets = domain.replace(/^\[/, "").replace(/\]$/, "");
  return isIpv4Address(domain) || withoutIpv6Brackets.includes(":");
}

export function canonicalCompanyDomain(input: unknown): string {
  if (typeof input !== "string") {
    throw new Error("domain is required");
  }

  if (input.trim().length === 0) {
    throw new Error("domain is invalid");
  }

  let domain: string;

  try {
    domain = canonicalDomain(input);
  } catch {
    throw new Error("domain is invalid");
  }

  if (
    domain.length === 0 ||
    domain.length > 253 ||
    domain === "localhost" ||
    !domain.includes(".") ||
    domain.includes("..") ||
    isIpLiteral(domain) ||
    localSuffixes.some((suffix) => domain.endsWith(suffix))
  ) {
    throw new Error("domain is invalid");
  }

  return domain;
}
