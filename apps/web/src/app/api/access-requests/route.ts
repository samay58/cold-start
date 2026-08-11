import { createAccessRequest, createDb } from "@cold-start/db";
import { z } from "zod";

import { apiJsonWithTiming } from "../../../lib/api-response";
import { readBoundedJson } from "../../../lib/bounded-json";
import { trustedClientHash } from "../../../lib/client-identity";
import { webEnv } from "../../../lib/web-env";

// The shared reader checks both declared and decoded length before parsing. This route gets
// the same cap as the other small unauthenticated JSON objects, not the larger event batch.
const MAX_REQUEST_BYTES = 2_048;

// Landing-page "ask for access" form. Public and unauthenticated by design (there is no
// credential to gate on before someone has access), so every input is treated as hostile:
// the honeypot short-circuits before any DB call, and validation failures never say which
// field was wrong.
const accessRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    // Lowercased before it reaches the repository so the per-email rate limit and any future
    // uniqueness check compare on a normalized value; without this, "Bob@x.com" and "bob@x.com"
    // read as different emails and each get their own 1-per-24h allowance.
    email: z
      .string()
      .trim()
      .toLowerCase()
      .min(1)
      .max(320)
      .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/),
    note: z.string().trim().min(1).max(500),
    company: z.string().trim().max(200).optional()
  })
  .strict();

function honeypotFilled(body: unknown): boolean {
  if (typeof body !== "object" || body === null) {
    return false;
  }
  const company = (body as Record<string, unknown>).company;
  return typeof company === "string" && company.trim().length > 0;
}

export async function POST(request: Request) {
  // No Server-Timing metrics on this route (unlike other API routes): the honeypot path below
  // returns before any DB call, so a real duration would leak a timing signal a bot could use to
  // tell the honeypot short-circuit apart from the real, DB-backed path. Omitting the header on
  // every response, not just the honeypot one, keeps the two paths indistinguishable.
  const respond = (body: unknown, init?: ResponseInit) => apiJsonWithTiming(body, [], init);

  const body = await readBoundedJson(request, MAX_REQUEST_BYTES);
  if (!body.ok) {
    return respond({ ok: false, error: "invalid" }, { status: 400 });
  }
  const unknownBody = body.value;

  // Bots and scrapers fill every field they can find, including the hidden honeypot. A real
  // browser never populates it. Answer with the same success body a real submission gets, and
  // never touch the database, so a scripted attacker learns nothing from response shape.
  if (honeypotFilled(unknownBody)) {
    return respond({ ok: true });
  }

  const parsed = accessRequestSchema.safeParse(unknownBody);
  if (!parsed.success) {
    return respond({ ok: false, error: "invalid" }, { status: 400 });
  }

  const ipHash = trustedClientHash(request.headers);
  if (!ipHash) {
    return respond({ ok: false, error: "unavailable" }, { status: 503 });
  }
  const db = createDb(webEnv().DATABASE_URL);
  const outcome = await createAccessRequest(db, {
    name: parsed.data.name,
    email: parsed.data.email,
    note: parsed.data.note,
    ipHash
  });

  if (outcome === "rate_limited_ip" || outcome === "rate_limited_email") {
    return respond({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  return respond({ ok: true });
}
