import { companySlugFromDomain } from "@cold-start/core";
import { createDb, markGenerationRun } from "@cold-start/db";
import { NextResponse } from "next/server";
import { inngest } from "../../../inngest/client";
import { boundedErrorMessage } from "../../../lib/errors";
import { canonicalCompanyDomain } from "../../../lib/domain";
import { webEnv } from "../../../lib/env";

export async function POST(request: Request) {
  let body: { domain?: unknown };

  try {
    body = (await request.json()) as { domain?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  let domain: string;

  try {
    domain = canonicalCompanyDomain(body.domain);
  } catch (error) {
    return NextResponse.json({ error: boundedErrorMessage(error) }, { status: 400 });
  }

  const slug = companySlugFromDomain(domain);
  const db = createDb(webEnv().DATABASE_URL);

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
