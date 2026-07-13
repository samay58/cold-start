import { NextRequest, NextResponse } from "next/server";

// Firefox MV3 extension pages CORS-preflight their API fetches even with host
// permissions granted (Chrome exempts extension fetches to host-permission
// origins entirely, so it never hits this path). Without these headers the
// preflight comes back bare and Firefox blocks the request before any route
// runs. This is header plumbing only: authentication stays in each route's
// assertExtensionRequest, and reflecting an extension origin grants nothing
// by itself because the API is bearer-token gated and cookie-free. Firefox
// origins are per-install random UUIDs (Bugzilla 1405971), so they cannot be
// enumerated in config and are reflected by scheme instead.
const ALLOWED_HEADERS = "authorization, content-type, x-cold-start-extension-id, x-cold-start-client-contract";

// The extension validates this response header cross-origin; without an
// expose header Firefox hides it from the panel's JS.
const EXPOSED_HEADERS = "x-cold-start-api-contract";

function extensionOrigin(request: NextRequest): string | null {
  const origin = request.headers.get("origin");
  if (!origin) {
    return null;
  }

  return origin.startsWith("moz-extension://") || origin.startsWith("chrome-extension://") ? origin : null;
}

export function middleware(request: NextRequest) {
  const origin = extensionOrigin(request);
  if (!origin) {
    return NextResponse.next();
  }

  if (request.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": origin,
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": ALLOWED_HEADERS,
        "access-control-expose-headers": EXPOSED_HEADERS,
        "access-control-max-age": "86400",
        vary: "Origin"
      }
    });
  }

  const response = NextResponse.next();
  response.headers.set("access-control-allow-origin", origin);
  response.headers.set("access-control-expose-headers", EXPOSED_HEADERS);
  response.headers.append("vary", "Origin");
  return response;
}

export const config = {
  matcher: ["/api/extension/:path*", "/api/generate"]
};
