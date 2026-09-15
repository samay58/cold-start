import { createDb, howItWinsJobSummary, reconcileExpiredHowItWinsJobs } from "@cold-start/db";
import type { HowItWinsJobSummary } from "@cold-start/core";
import { z } from "zod";
import { apiJsonWithTiming } from "../../../../../../lib/api-response";
import { authenticateExtensionRequest, principalHasScope } from "../../../../../../lib/extension-auth";
import { readBoundedJson } from "../../../../../../lib/bounded-json";
import { webEnv } from "../../../../../../lib/web-env";
import {
  dispatchHowItWinsJob, howItWinsStatusForPrincipal, recordHowItWinsJobOutcome, retryHowItWinsJob
} from "../../../../../../inngest/how-it-wins-jobs";
import { HowItWinsExecutionError } from "../../../../../../inngest/how-it-wins-execution";

type Context = { params: Promise<{ slug: string }> };
const bodySchema = z.object({ jobId: z.string().uuid(), requestId: z.string().uuid() }).strict();
const slugSchema = z.string().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const json = (body: unknown, status = 200) => apiJsonWithTiming(body, [], {
  status, headers: { "Cache-Control": "no-store" }
});

// Extension builds before the deadline poll (the September 14 0.2.9 package; 0.2.8 never calls
// this route) parse the envelope with a strict schema, so an unrequested key would break their
// poll. deadlineAt ships only to a client that asks for it by query parameter.
function wantsDeadline(request: Request) {
  return new URL(request.url).searchParams.get("deadline") === "1";
}

function presented(summary: HowItWinsJobSummary | null, keepDeadline: boolean) {
  if (!summary || keepDeadline) return summary;
  const { deadlineAt: _deadlineAt, ...rest } = summary;
  return rest;
}

export async function GET(request: Request, { params }: Context) {
  const db = createDb(webEnv().DATABASE_URL);
  const auth = await authenticateExtensionRequest(request.headers, () => db);
  if (!auth.ok) return json({ error: auth.error, code: auth.code }, auth.status);
  if (!principalHasScope(auth.principal, "cards:read")) return json({ error: "Card access is not allowed." }, 403);
  const parsed = slugSchema.safeParse((await params).slug);
  if (!parsed.success) return json({ error: "Company not found." }, 404);
  // Expiry settled on read still owes the parent run its how-it-wins.complete event.
  for (const job of await reconcileExpiredHowItWinsJobs(db, { limit: 20 })) {
    await recordHowItWinsJobOutcome(db, { job });
  }
  const status = await howItWinsStatusForPrincipal(db, parsed.data, auth.principal);
  return json({ job: presented(status.job, wantsDeadline(request)) });
}

export async function POST(request: Request, { params }: Context) {
  const db = createDb(webEnv().DATABASE_URL);
  const auth = await authenticateExtensionRequest(request.headers, () => db);
  if (!auth.ok) return json({ error: auth.error, code: auth.code }, auth.status);
  if (!principalHasScope(auth.principal, "generation:write")) return json({ error: "Retry is not allowed." }, 403);
  const slug = slugSchema.safeParse((await params).slug);
  if (!slug.success) return json({ error: "Company not found." }, 404);
  // Reject oversized bodies before parsing; request IDs never substitute for atomic admission.
  const body = await readBoundedJson(request, 512);
  if (!body.ok) return json({ error: "Invalid retry request." }, body.reason === "too_large" ? 413 : 400);
  const parsed = bodySchema.safeParse(body.value);
  if (!parsed.success) return json({ error: "Invalid retry request." }, 400);
  try {
    const keepDeadline = wantsDeadline(request);
    const result = await retryHowItWinsJob(db, { slug: slug.data, jobId: parsed.data.jobId, principal: auth.principal });
    if (!result || (result.state !== "admitted" && result.state !== "joined")) {
      const status = await howItWinsStatusForPrincipal(db, slug.data, auth.principal);
      return json({ error: "This read cannot be retried.", job: presented(status.job, keepDeadline) }, 409);
    }
    if (result.job.status === "queued") {
      // The job exists before sending. A lost acknowledgement cannot admit another paid job.
      await dispatchHowItWinsJob(db, result.job);
    }
    return json({ job: presented(howItWinsJobSummary(result.job), keepDeadline) }, result.job.status === "queued" ? 202 : 200);
  } catch (error) {
    if (error instanceof HowItWinsExecutionError) return json({ error: "How it wins retry is unavailable." }, 503);
    throw error;
  }
}
