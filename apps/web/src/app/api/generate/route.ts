import { companySlugFromDomain } from "@cold-start/core";
import { createDb, findActiveGenerationRunBySlug, findPublicCardBySlug, markGenerationRun } from "@cold-start/db";
import { NextResponse } from "next/server";
import { inngest } from "../../../inngest/client";
import { boundedErrorMessage } from "../../../lib/errors";
import { canonicalCompanyDomain } from "../../../lib/domain";
import { webEnv } from "../../../lib/env";

export async function POST(request: Request) {
  let body: { domain?: unknown; confirmStart?: unknown };

  try {
    body = (await request.json()) as { domain?: unknown; confirmStart?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  if (body.confirmStart !== true) {
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
  const cached = await findPublicCardBySlug(db, slug);

  if (cached) {
    return NextResponse.json({ slug, status: "cached" }, { status: 200 });
  }

  const activeRun = await findActiveGenerationRunBySlug(db, slug);

  if (activeRun) {
    return NextResponse.json({ slug, status: activeRun.status }, { status: 202 });
  }

  // This avoids cached and active duplicate work, but two simultaneous fresh POSTs can still pass this guard.
  // Add a DB partial unique index or lock before public traffic.
  await markGenerationRun(db, { slug, domain, status: "queued" });

  try {
    await inngest.send({
      name: "card/generate.requested",
      data: { domain, slug },
    });
  } catch (error) {
    await markGenerationRun(db, { slug, domain, status: "failed", error: boundedErrorMessage(error) });
    return NextResponse.json({ error: "failed to queue generation" }, { status: 500 });
  }

  return NextResponse.json({ slug, status: "queued" }, { status: 202 });
}
