import { canonicalDomain, companySlugFromDomain } from "@cold-start/core";
import { NextResponse } from "next/server";
import { inngest } from "../../../inngest/client";

export async function POST(request: Request) {
  let body: { domain?: unknown };

  try {
    body = (await request.json()) as { domain?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  if (typeof body.domain !== "string" || body.domain.trim().length === 0) {
    return NextResponse.json({ error: "domain is required" }, { status: 400 });
  }

  let domain: string;

  try {
    domain = canonicalDomain(body.domain);
  } catch {
    return NextResponse.json({ error: "domain is invalid" }, { status: 400 });
  }

  const slug = companySlugFromDomain(domain);

  await inngest.send({
    name: "card/generate.requested",
    data: { domain, slug },
  });

  return NextResponse.json({ slug, status: "queued" }, { status: 202 });
}
