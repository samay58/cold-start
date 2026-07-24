import { createHash, timingSafeEqual } from "node:crypto";

import {
  findActiveAlphaInstallationByTokenHash,
  touchAlphaInstallation,
  type ColdStartDb
} from "@cold-start/db";

import { alphaAccessEnabled } from "./alpha-config";

const LOCAL_CHROME_EXTENSION_WILDCARD = "chrome-extension://*";
const LOCAL_DEFAULT_EXTENSION_ORIGINS = "chrome-extension://*,http://localhost:5173";
const extensionIdHeader = "x-cold-start-extension-id";
const localExtensionId = "local-dev";
const localExtensionToken = "local-extension-token";

export type AlphaPrincipal = {
  kind: "alpha" | "operator";
  inviteId: string | null;
  installationId: string | null;
  scopes: readonly string[];
};

export type AlphaScope = "cards:read" | "events:write" | "generation:write";

type ExtensionAuthResult =
  | { ok: true; principal: AlphaPrincipal }
  | { ok: false; status: number; error: string; code: string };

export function principalHasScope(principal: AlphaPrincipal, scope: AlphaScope) {
  return principal.kind === "operator" || principal.scopes.includes(scope);
}

function logAuthRejection(status: number, code: string) {
  console.warn("[alpha-security]", {
    signal: "extension_auth_rejected",
    status,
    code
  });
}

function timingSafeStringEqual(a: string, b: string): boolean {
  // timingSafeEqual requires equal-length buffers; length-mismatch short-circuits to false.
  // Stringify-first ensures we never throw on weird header values.
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

function parseConfiguredValues(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function configuredValues(value: string | undefined, fallback: string | undefined): string[] {
  const values = parseConfiguredValues(value);
  return values.length > 0 ? values : parseConfiguredValues(fallback);
}

function isAllowedOrigin(origin: string, allowedOrigins: string[]) {
  if (allowedOrigins.includes(origin)) {
    return true;
  }

  if (
    process.env.NODE_ENV !== "production" &&
    allowedOrigins.includes(LOCAL_CHROME_EXTENSION_WILDCARD) &&
    origin.startsWith("chrome-extension://")
  ) {
    return true;
  }

  return false;
}

function isAllowedProductionOrigin(origin: string, allowedOrigins: string[]) {
  if (!origin || origin.startsWith("moz-extension://")) {
    return true;
  }
  return allowedOrigins.includes(origin);
}

function hasUnsafeProductionConfig(allowedOrigins: string[], allowedExtensionIds: string[], apiTokens: string[]) {
  return (
    process.env.NODE_ENV === "production" &&
    (
      allowedOrigins.includes(LOCAL_CHROME_EXTENSION_WILDCARD) ||
      allowedOrigins.some((origin) => origin.startsWith("moz-extension://") && origin.includes("*")) ||
      allowedOrigins.some((origin) => origin.startsWith("http://localhost") || origin.startsWith("http://127.0.0.1")) ||
      allowedExtensionIds.includes(localExtensionId) ||
      apiTokens.includes(localExtensionToken)
    )
  );
}

export function assertExtensionRequest(headers: Headers) {
  const origin = headers.get("origin") ?? "";
  const extensionId = headers.get(extensionIdHeader)?.trim() ?? "";
  const configuredOrigins = process.env.ALLOWED_EXTENSION_ORIGINS;
  const allowedExtensionIds = configuredValues(process.env.ALLOWED_EXTENSION_IDS, process.env.CHROME_EXTENSION_ID);
  const apiTokens = configuredValues(process.env.EXTENSION_API_TOKENS, process.env.EXTENSION_API_TOKEN);

  if ((process.env.NODE_ENV === "production" && allowedExtensionIds.length === 0) || apiTokens.length === 0) {
    return { ok: false as const, status: 500, error: "extension auth not configured" };
  }

  const defaultOrigins = process.env.NODE_ENV === "production" ? "" : LOCAL_DEFAULT_EXTENSION_ORIGINS;
  const allowed = parseConfiguredValues(configuredOrigins ?? defaultOrigins);

  if (hasUnsafeProductionConfig(allowed, allowedExtensionIds, apiTokens)) {
    return { ok: false as const, status: 500, error: "extension auth not configured" };
  }

  const allowedByExtensionId =
    process.env.NODE_ENV === "production" ? allowedExtensionIds.includes(extensionId) : extensionId.length > 0;
  const allowedByOrigin =
    process.env.NODE_ENV === "production"
      ? isAllowedProductionOrigin(origin, allowed)
      : isAllowedOrigin(origin, allowed);
  const identityAllowed =
    process.env.NODE_ENV === "production" ? allowedByExtensionId && allowedByOrigin : allowedByExtensionId || allowedByOrigin;

  if (!identityAllowed) {
    return { ok: false as const, status: 403, error: "extension identity required" };
  }

  const authorization = headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    return { ok: false as const, status: 401, error: "extension token required" };
  }

  const token = authorization.slice("Bearer ".length);
  const tokenMatches = apiTokens.reduce(
    (matches, configuredToken) => timingSafeStringEqual(token, configuredToken) || matches,
    false
  );
  if (!tokenMatches) {
    return { ok: false as const, status: 401, error: "extension token invalid" };
  }

  return { ok: true as const };
}

export async function authenticateExtensionRequest(
  headers: Headers,
  db: ColdStartDb | (() => ColdStartDb)
): Promise<ExtensionAuthResult> {
  const identity = assertExtensionIdentity(headers);
  if (!identity.ok) {
    logAuthRejection(identity.status, identity.code);
    return identity;
  }

  const token = bearerToken(headers);
  if (!token) {
    logAuthRejection(401, "authentication");
    return {
      ok: false,
      status: 401,
      error: "extension connection required",
      code: "authentication"
    };
  }

  const apiTokens = configuredValues(process.env.EXTENSION_API_TOKENS, process.env.EXTENSION_API_TOKEN);
  const operatorMatches = apiTokens.reduce(
    (matches, configuredToken) => timingSafeStringEqual(token, configuredToken) || matches,
    false
  );
  if (operatorMatches) {
    return {
      ok: true,
      principal: {
        kind: "operator",
        inviteId: null,
        installationId: null,
        scopes: ["operator"]
      }
    };
  }

  if (!alphaAccessEnabled()) {
    return {
      ok: false,
      status: 503,
      error: "alpha access is temporarily paused",
      code: "access_disabled"
    };
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const resolvedDb = typeof db === "function" ? db() : db;
  const auth = await findActiveAlphaInstallationByTokenHash(resolvedDb, tokenHash);
  if (!auth) {
    logAuthRejection(401, "authentication");
    return {
      ok: false,
      status: 401,
      error: "extension connection needs repair",
      code: "authentication"
    };
  }

  const extensionVersion = normalizedExtensionVersion(headers);
  await touchAlphaInstallation(resolvedDb, auth.installation.id, {
    ...(extensionVersion ? { extensionVersion } : {})
  }).catch(() => false);

  return {
    ok: true,
    principal: {
      kind: "alpha",
      inviteId: auth.invite.id,
      installationId: auth.installation.id,
      scopes: auth.invite.scopes
    }
  };
}

function assertExtensionIdentity(
  headers: Headers
): { ok: true } | { ok: false; status: number; error: string; code: string } {
  const origin = headers.get("origin") ?? "";
  const extensionId = headers.get(extensionIdHeader)?.trim() ?? "";
  const configuredOrigins = process.env.ALLOWED_EXTENSION_ORIGINS;
  const allowedExtensionIds = configuredValues(process.env.ALLOWED_EXTENSION_IDS, process.env.CHROME_EXTENSION_ID);
  const apiTokens = configuredValues(process.env.EXTENSION_API_TOKENS, process.env.EXTENSION_API_TOKEN);
  const defaultOrigins = process.env.NODE_ENV === "production" ? "" : LOCAL_DEFAULT_EXTENSION_ORIGINS;
  const allowedOrigins = parseConfiguredValues(configuredOrigins ?? defaultOrigins);

  if (
    (process.env.NODE_ENV === "production" && allowedExtensionIds.length === 0) ||
    apiTokens.length === 0 ||
    hasUnsafeProductionConfig(allowedOrigins, allowedExtensionIds, apiTokens)
  ) {
    return {
      ok: false,
      status: 500,
      error: "extension auth not configured",
      code: "authentication"
    };
  }

  const allowedByExtensionId =
    process.env.NODE_ENV === "production" ? allowedExtensionIds.includes(extensionId) : extensionId.length > 0;
  const allowedByOrigin =
    process.env.NODE_ENV === "production"
      ? isAllowedProductionOrigin(origin, allowedOrigins)
      : isAllowedOrigin(origin, allowedOrigins);
  const identityAllowed =
    process.env.NODE_ENV === "production"
      ? allowedByExtensionId && allowedByOrigin
      : allowedByExtensionId || allowedByOrigin;

  if (!identityAllowed) {
    return {
      ok: false,
      status: 403,
      error: "extension identity required",
      code: "authentication"
    };
  }

  return { ok: true };
}

function bearerToken(headers: Headers) {
  const authorization = headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    return null;
  }
  const token = authorization.slice("Bearer ".length).trim();
  return token || null;
}

function normalizedExtensionVersion(headers: Headers) {
  const value = headers.get("x-cold-start-extension-version")?.trim() ?? "";
  return /^\d+(?:\.\d+){0,3}$/.test(value) ? value : undefined;
}
