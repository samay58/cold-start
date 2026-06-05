# Trail 0: Queue a sourced company profile

Time: about 16 minutes.

Cold Start starts with a plain request: "Build me a company profile for this domain." From there, the app has to do a surprising amount of careful work. It normalizes the domain, checks whether a usable card already exists, queues a background job, fetches sources, extracts only cited facts, validates the card shape, then saves the result so the public page and the extension can read from the same stored truth.

This trail follows that first path. If you understand this one, most of the repo becomes less mysterious.

## Try it

With the local stack running, ask for a basic company profile:

```bash
curl -i -X POST http://localhost:3000/api/generate \
  -H 'content-type: application/json' \
  -d '{"domain":"cartesia.ai","confirmStart":true}'
```

If the profile is new, the response should be accepted rather than complete:

```json
{
  "slug": "cartesia",
  "domain": "cartesia.ai",
  "mode": "basics",
  "status": "queued",
  "events": [
    {
      "type": "generation.queued",
      "message": "Queued company profile"
    }
  ]
}
```

If the card is already fresh enough, the same request can return `"status": "cached"` instead. That is not a special case in the product. It is the same route deciding that the stored card is already good enough to use.

One safety note: a real generation run can call provider APIs and LLMs if your local environment has those keys enabled. If you only want to learn the flow, read the code path first and run the command later.

## The request handler is a traffic cop

The `POST /api/generate` route does not build the card itself. It decides what kind of work is allowed and whether any work is needed.

It starts by parsing the JSON body. The important inputs are the company domain, the requested mode, the optional research section, and the confirmation flag. A basics run builds the public profile. An analysis run or section run belongs to the extension surface and needs extension auth.

Then the route normalizes the domain. That means user input like `https://www.cartesia.ai/` becomes the canonical company domain, and the slug becomes `cartesia`. From this point on, the rest of the system uses the canonical pair: domain for providers, slug for storage and URLs.

Before queueing anything, the route asks the database two questions:

- Is there already a usable card for this slug and mode?
- Is there already an active run for this slug and mode?

Those checks keep the app from doing expensive duplicate work. A fresh public card returns immediately as cached. An active run returns as accepted with the current event stream. Only when neither exists does the route create a queued generation run.

Once it has a queued run, the route sends one Inngest event:

```text
card/generate.requested
```

That event is the handoff. The web request can now return quickly, while the worker takes over the slow path.

## The worker owns the long work

The Inngest worker receives `card/generate.requested` and immediately rebuilds the same basic identity: domain, slug, mode, and job kind. It also creates a trace object. Think of the trace as the flight recorder for one generation run. Later, when a card is thin or a provider fails, this trace is how you explain what happened without guessing.

The worker marks the run as running and writes a first user-visible event:

```text
Started company profile
```

There is a section-generation branch near the top of the worker, but this trail is not using it. Because the request did not include a `sectionId`, the worker stays on the full profile path.

The first real planning step is a fallback research plan. It gives the worker a small set of search intentions for the company. Then the worker loads any existing card. That matters for analysis mode, where an investor analysis can reuse a public profile if it is already strong enough.

## Sources come before claims

Cold Start does not ask the LLM to invent a profile from a company name. It fetches evidence first.

The source step tries Direct Exa and StableEnrich. In cheap-first mode, Direct Exa runs first. If it already covers enough basics, the StableEnrich probes can skip work that would likely duplicate it. In non-cheap-first mode, both provider paths run at the same time.

After the provider calls return, the worker merges sources and sends them through the source gate. The gate rejects irrelevant sources before the LLM sees them. That is an important trust boundary: a source can be real and still not be useful for this company.

If no accepted sources survive, the run fails early with a clear error. That is better than spending LLM tokens to produce a confident but thin card.

If sources do survive, the worker records a source event:

```text
Found N accepted sources
```

That event is simple on purpose. It gives the UI a useful progress update while the trace keeps the deeper provider details.

## The first stored card can be partial

For basics runs, the worker tries to build a seed profile card right after source fetching. It is the first "give the user something usable" moment.

The seed card is built from accepted sources and provider facts. If it passes the minimum storage rules, the worker stores it, records its evidence, records its sources, and emits:

```text
Saved first usable company card
```

That seed is not the final answer. It is a safe early snapshot. The app can show a first usable profile while the cleaner generated card continues through extraction and validation.

## Extraction turns evidence into the card shape

The worker calls `generateCardForDomainWithTrace` for the full card attempt. That function is the small pipeline inside the larger orchestration.

It starts with a skeleton card for the domain. Then it fetches the accepted sources from the worker, builds an evidence ledger, and calls the extraction function. The extractor prompt is strict:

- Drop unsupported claims.
- Map every material fact to citation IDs.
- Use `null` when a fact is missing.
- Keep the company description concrete and complete.
- Avoid brochure language and generic category labels.

The model is forced to return through one extraction tool. That gives the code a structured object instead of free-form prose. The pipeline then merges provider facts, optionally patches thin blocks, and checks whether any citations survived.

If no cited facts survive, the pipeline either builds a fallback from the evidence ledger or fails with a trace-aware error. It does not quietly store an uncited card.

## Validation is the contract

After extraction, the pipeline builds a `ColdStartCard` and runs it through the shared schema.

This matters because the same card travels through several surfaces:

- The database stores it.
- The public API reads a redacted version.
- The extension reads the richer version.
- The shared UI renders it.

The schema makes those surfaces agree on the same shape. It also checks citation references. If a fact points to citation `c3`, citation `c3` must exist in the top-level `citations` array.

For a basics run, synthesis is skipped. For analysis mode, synthesis has its own evidence gate and verifier. That is why public facts and investor synthesis stay separated even though they live near each other in the card model.

## The final card replaces the early snapshot

When the generated card passes validation, the worker prepares the card snapshot for storage. If the snapshot is strong enough, it writes the card, evidence, legacy research-section rows, and source records. Then it emits:

```text
Saved cited company card
```

At that point, the company has one stored card that other parts of the app can read. The public route can strip private synthesis and render `/c/cartesia`. The extension can read the same stored card, show source counts, and offer deeper research cards.

The important idea is that the request did not directly return a finished profile. It started a durable run. The run produced events for the user, a trace for debugging, sources for auditability, and a validated card for every reader surface.

## In the code

- `apps/web/src/app/api/generate/route.ts:146` parses the request body, chooses mode, checks auth, normalizes the domain, reads cache state, creates the queued run, and sends the Inngest event.
- `apps/web/src/app/api/generate/route.ts:215` returns a cached response when a usable stored card already exists.
- `apps/web/src/app/api/generate/route.ts:251` records a queued run and a `generation.queued` event.
- `apps/web/src/app/api/generate/route.ts:307` sends `card/generate.requested` to Inngest.
- `apps/web/src/inngest/functions.ts:1073` defines the generation worker.
- `apps/web/src/inngest/functions.ts:1205` writes the started event that the UI can show.
- `apps/web/src/inngest/functions.ts:1329` starts source fetching.
- `apps/web/src/inngest/functions.ts:1378` merges provider sources and applies the source gate.
- `apps/web/src/inngest/functions.ts:1474` records the accepted-source count.
- `apps/web/src/inngest/functions.ts:1490` builds and stores the seed profile card for basics mode.
- `apps/web/src/inngest/functions.ts:1587` calls the full card-generation pipeline.
- `apps/web/src/inngest/functions.ts:1648` stores the final generated card and its evidence.
- `packages/pipeline/src/generate-card.ts:699` turns accepted sources into a validated `ColdStartCard`.
- `packages/pipeline/src/generate-card.ts:729` refuses to continue silently when no citations survive extraction.
- `packages/pipeline/src/generate-card.ts:763` validates the card against the shared schema.
- `packages/llm/src/extraction.ts:266` defines the extraction rules the model must follow.
- `packages/llm/src/extraction.ts:730` calls the extraction model with the structured extraction tool.
- `packages/core/src/card.ts:98` defines the main card object schema.
- `packages/db/src/repository.ts:843` writes the card snapshot to the database.
