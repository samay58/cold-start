# Trail 1: Open a public card

Time: about 10 minutes.

This trail starts after [Trail 0](./trail-0-queue-a-company-profile.md). A generation run has saved a card. Now you open the public surface and see what a normal reader sees: sourced facts, citation markers, source mix, and no private investor synthesis.

## Try it

With the web app running and a card already generated, open the public JSON route:

```bash
curl -s http://localhost:3000/api/cards/cartesia | jq '{
  slug,
  domain,
  name: .identity.name.value,
  source_count: (.citations | length),
  has_synthesis: has("synthesis")
}'
```

The shape should look like this:

```json
{
  "slug": "cartesia",
  "domain": "cartesia.ai",
  "name": "Cartesia",
  "source_count": 8,
  "has_synthesis": false
}
```

Then open the page:

```text
http://localhost:3000/c/cartesia
```

The page and the JSON route read through the same public-card path. The page renders the card. The API shows you the data behind it.

## The public page asks for one card

The `/c/{slug}` page does not know how to query providers, run LLMs, or build cards. It receives the slug from the URL and asks for a cached public card.

If the helper returns nothing, the page calls Next.js `notFound()`. If a card comes back, the page renders one `CardShell` with `surface="web"`. That prop matters. The shared UI component can render both the public web card and the extension profile, but this path chooses the public version.

The page also builds metadata from the same card. Title, description, Open Graph image path, and Twitter card data all come from the stored public profile. That keeps search previews aligned with what the reader sees on the page.

## The helper filters for public usefulness

The page calls `getPublicCachedCard(slug)`. That helper creates a database connection, reads the public card by slug, checks whether the public profile is usable, and materializes funding if funding evidence can be inferred safely from citations.

The quality check is not about whether every field is perfect. It asks whether the profile has enough visible, cited structure to be worth showing. A card with no useful public profile should not become a polished-looking empty shell.

The funding materialization step is a reader-facing convenience. If the card lacks structured funding fields but the citations include closed financing evidence with an amount, the helper can turn that cited evidence into a displayed funding round. It still stays citation-backed.

## The repository removes private synthesis

The database stores the full card JSON in one place. That stored object may include `synthesis` when an analysis run has produced it.

The public read path strips that field before returning. `findPublicCardBySlug` parses the stored card, applies cache freshness rules, runs it through `publicCard`, and validates it against a schema that omits `synthesis`.

That is the main public-private boundary in this trail. Public readers get the company profile. Extension readers can ask for the fuller private surface through extension-authenticated routes.

The public helper also strips person emails from team facts. Public pages can show founders and executives without exposing enriched contact data.

## The public API mirrors the page

The JSON route at `/api/cards/{slug}` calls the same helper as the page. It also fetches the latest provider-failure summary in parallel.

That failure summary is best-effort observability. If it exists, the route can attach headers that explain recent provider trouble. If it fails, the card response still goes through.

The route sets short public cache headers, returns `404` when no usable public card exists, and returns the public card JSON when it does.

## The card renders facts, not investor judgment

On the web surface, `CardShell` renders the card like a catalogue entry.

The top of the card shows the company name, short description, location or domain, founded year, and cited-source count. Then the source signature shows the mix of independent, reporting, and company-authored sources.

The key-value strip shows the facts readers usually scan first: amount raised, last round, headcount, headquarters, founding year, and founders. Each fact carries an evidence state. Missing facts say "not found" rather than pretending the system knows.

The main body renders proof, money, people, signals, and comparable companies when the card has them. The source rail lists the citations. The footer says the public contract plainly:

```text
Public card. Sourced facts only. The investor lens lives behind the extension.
```

The "Open questions" block is safe on the public card because it falls back to a generic question when no synthesis exists. On this public path, `has_synthesis` is false, so the card never reads private bull, bear, or investor framing.

## In the code

- `apps/web/src/app/c/[slug]/page.tsx:15` caches the public-card helper call for the page render.
- `apps/web/src/app/c/[slug]/page.tsx:25` builds page metadata from the public card.
- `apps/web/src/app/c/[slug]/page.tsx:50` reads the slug, fetches the public card, returns `notFound()` when missing, and renders `CardShell` with `surface="web"`.
- `apps/web/src/lib/cards.ts:14` defines `getPublicCachedCard`.
- `apps/web/src/lib/cards.ts:16` reads the card through `findPublicCardBySlug` with stale reads allowed.
- `apps/web/src/lib/cards.ts:17` requires a usable public profile and materializes funding from citations before returning.
- `packages/db/src/repository.ts:52` defines the public-card schema as the main card shape without `synthesis`.
- `packages/db/src/repository.ts:172` reads one stored card row by slug for the public path.
- `packages/db/src/repository.ts:195` returns the sanitized public card through the public schema.
- `packages/core/src/trust.ts:197` removes synthesis and person emails from the public card.
- `packages/core/src/card-quality.ts:176` defines the usable-public-profile check.
- `packages/core/src/funding-evidence.ts:277` turns closed cited financing evidence into displayable funding fields when structured funding is missing.
- `apps/web/src/app/api/cards/[slug]/route.ts:8` defines the public JSON route.
- `apps/web/src/app/api/cards/[slug]/route.ts:14` fetches the public card and provider-failure summary in parallel.
- `apps/web/src/app/api/cards/[slug]/route.ts:22` sets short public cache headers.
- `packages/ui/src/CardShell.tsx:25` checks whether a card includes synthesis.
- `packages/ui/src/CardShell.tsx:540` renders the public web card branch.
- `packages/ui/src/CardShell.tsx:559` falls back to a generic public open question when synthesis is absent.
- `packages/ui/src/CardShell.tsx:603` renders the public key facts.
- `packages/ui/src/CardShell.tsx:722` renders the source ledger.
- `packages/ui/src/CardShell.tsx:734` prints the public-card footer.
