import { companySlugFromDomain } from "@cold-start/core";
import { createDb, findActiveGenerationRunBySlug, findCardBySlug, findPublicCardBySlug, markGenerationRun } from "@cold-start/db";
import { NextResponse } from "next/server";
import { inngest } from "../../../inngest/client";
import { boundedErrorMessage } from "../../../lib/errors";
import { canonicalCompanyDomain } from "../../../lib/domain";
import { webEnv } from "../../../lib/env";
import { assertExtensionRequest } from "../../../lib/extension-auth";

type GenerationMode = "basics" | "analysis";

function generationMode(input: unknown): GenerationMode {
  return input === "analysis" || input === "basics" ? input : "basics";
}

export async function POST(request: Request) {
  let body: { domain?: unknown; confirmStart?: unknown; mode?: unknown };

  try {
    body = (await request.json()) as { domain?: unknown; confirmStart?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const mode = generationMode(body.mode);
  const extensionAuth = assertExtensionRequest(request.headers);
  const confirmed = body.confirmStart === true;

  if (mode === "analysis" && !extensionAuth.ok) {
    return NextResponse.json({ error: extensionAuth.error }, { status: extensionAuth.status });
  }

  if (!confirmed && !(mode === "basics" && extensionAuth.ok)) {
    return NextResponse.json({ error: "generation start confirmation required" }, { status: 400 });
  }

  let domain: string;

  try {
    domain = canonicalCompanyDomain(body.domain);
  } catch (error) {
    return NextResponse.json({ error: boundedErrorMessage(error) }, { status: 400 });
  }

  const slug = companySlugFromDomain(domain);
  const db = createDb(webEnv().DATABASE_URL);
  const cached = mode === "analysis" ? await findCardBySlug(db, slug) : await findPublicCardBySlug(db, slug);

  if (cached && (mode === "basics" || ("synthesis" in cached && cached.synthesis))) {
    return NextResponse.json({ slug, status: "cached", mode }, { status: 200 });
  }

  const activeRun = await findActiveGenerationRunBySlug(db, slug, mode);

  if (activeRun) {
    return NextResponse.json({ slug, status: activeRun.status, mode }, { status: 202 });
  }

  // This avoids cached and active duplicate work, but two simultaneous fresh POSTs can still pass this guard.
  // Add a DB partial unique index or lock before public traffic.
  await markGenerationRun(db, { slug, domain, mode, status: "queued" });

  try {
    await inngest.send({
      name: "card/generate.requested",
      data: { domain, slug, mode },
    });
  } catch (error) {
    await markGenerationRun(db, { slug, domain, mode, status: "failed", error: boundedErrorMessage(error) });
    return NextResponse.json({ error: "failed to queue generation" }, { status: 500 });
  }

  return NextResponse.json({ slug, status: "queued", mode }, { status: 202 });
}
