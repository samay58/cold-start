import { createHash } from "node:crypto";

import { createAccessRequest, createDb } from "@cold-start/db";
import { z } from "zod";

import { apiJsonWithTiming } from "../../../lib/api-response";
import { webEnv } from "../../../lib/web-env";

// Landing-page "ask for access" form. Public and unauthenticated by design (there is no
// credential to gate on before someone has access), so every input is treated as hostile:
// the honeypot short-circuits before any DB call, and validation failures never say which
// field was wrong.
const accessRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: z
      .string()
      .trim()
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

function hashFirstForwardedFor(headers: Headers): string {
  const forwardedFor = headers.get("x-forwarded-for");
  const firstHop = forwardedFor?.split(",")[0]?.trim() || "unknown";
  return createHash("sha256").update(firstHop).digest("hex");
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  const respond = (body: unknown, init?: ResponseInit) =>
    apiJsonWithTiming(
      body,
      [{ name: "total", durationMs: performance.now() - startedAt }],
      init
    );

  let unknownBody: unknown;
  try {
    unknownBody = JSON.parse(await request.text());
  } catch {
    return respond({ ok: false, error: "invalid" }, { status: 400 });
  }

  // Bots and scrapers fill every field they can find, including the hidden honeypot. A real
  // browser never populates it. Answer with the same success body a real submission gets, and
  // never touch the database, so a scripted attacker learns nothing from timing or response
  // shape.
  if (honeypotFilled(unknownBody)) {
    return respond({ ok: true });
  }

  const parsed = accessRequestSchema.safeParse(unknownBody);
  if (!parsed.success) {
    return respond({ ok: false, error: "invalid" }, { status: 400 });
  }

  const ipHash = hashFirstForwardedFor(request.headers);
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
