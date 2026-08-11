import { createHash } from "node:crypto";
import { isIP } from "node:net";

export function trustedClientAddress(headers: Headers): string | null {
  const deployedOnVercel = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
  const candidate = deployedOnVercel
    ? headers.get("x-vercel-forwarded-for")
    : headers.get("x-vercel-forwarded-for") ?? headers.get("x-forwarded-for")?.split(",")[0];
  const address = candidate?.trim() ?? "";
  if (isIP(address)) return address;
  return deployedOnVercel ? null : "127.0.0.1";
}

export function trustedClientHash(headers: Headers): string | null {
  const address = trustedClientAddress(headers);
  if (!address) return null;
  return createHash("sha256")
    .update(`cold-start-client-v1:${address}`)
    .digest("hex");
}
