# Friend-Alpha Invite Elegance

Date: 2026-07-30. Status: approved; direction, model, and card copy settled by live tests the same day. Scope: the invite artifact only. The install-and-connect ceremony stays as shipped.

## The problem

The invite a friend receives today is this, pasted raw into an iMessage thread:

```
https://cold-start.semitechie.vc/alpha#invite=Xk3jP9qLm2vR8tYw4nZbF6hD1cAeG7sUoI5xKdMpQrE
```

Ninety characters, half of it random base64. It looks like a phishing link. On Firefox the friend has to copy-paste the whole thing into the panel. The 43-character secret exists only because 256 bits of entropy was the default, not because the threat model needs it.

## The shape of the fix

The invite becomes a one-of-one object, not a string. Three parts:

1. **The link gets short and human.** `https://cold-start.semitechie.vc/i/dad#ember-quarto-lark`. Public per-person slug in the path, speakable three-word secret in the fragment.
2. **iMessage shows a card, not a URL.** The link's preview image is a generated, personalized invitation card. When the link is sent as its own message bubble, iMessage replaces the URL text entirely with the card.
3. **The card is generated art, not an assembled template.** A frontier image model paints each friend's card at mint time, letterpress type rendered in-scene. Samay approves each card before it ships. Twelve invites, one edition, no two alike.

## The link

```
https://cold-start.semitechie.vc/i/{slug}#{code}
```

- `slug`: public, non-secret, per-invite. Derived from the label at mint time (`dad`, `priya`); collisions get a suffix. It exists so the server can render that person's card for the link preview. The URL fragment never reaches a server, so personalization cannot ride on the secret.
- `code`: the secret. Three words, for example `ember-quarto-lark`. Single-use, 14-day expiry, SHA-256 stored server-side. All unchanged from today except the format.
- Old links (`/alpha#invite=<base64>`) keep working. The token pattern accepts both shapes.

## The card

### Generation pipeline (mint time, operator CLI)

`npm run alpha:invite -- --label "Dad" --name "Dad"`

1. **Art layer, settled.** The house direction is the sealed letterpress card: handmade cream paper with a deckle edge, letterpress-debossed "Invitation, for [Name]", a small letterpress "No [NN]" in the top right corner, "Cold Start" small at lower left, one violet wax seal bearing CS at lower right. Model: Nano Banana Pro, called as `google/gemini-3-pro-image` through OpenRouter with the `OPENROUTER_API_KEY` already in the repo env, image input plus image output. Every call attaches the checked-in house reference image so all cards read as one edition; only the name and number vary. No personal motifs in v1; personalization is the name and the number. Realized cost in the live test: about $0.07 per candidate, two candidates per call.
2. **Type is model-rendered, proven.** The live mints rendered the letterpress line and corner number legibly and beautifully on the first try; a deterministic overlay would sit flat on a photographic deboss and look pasted. So the model renders the words in-scene, and the approval loop is the spelling gate: any mangled name is a re-roll, which costs cents. A deterministic type overlay remains the recorded fallback if some future name keeps misrendering.
3. **Approval loop.** The CLI writes candidate PNGs to a local directory. Samay looks, re-rolls if needed, approves one. Only then is the invite row created and the link printed.

### Card copy rules

Less is more, settled 2026-07-30: the paper carries only the product name ("Cold Start"), the letterpress line "Invitation, for [Name]", the number, and the seal. The number is "No [NN]", top right corner, smaller than the main line, open-ended (no "of 12", so the circle can grow without reprints). Never "friend alpha" (internal delineation only, not artifact copy), never an expiry date, never feature copy. Expiry and allowances live in the system, not on the card.

### Card facts that came out of research

- The preview must be a static PNG. No messenger in scope (iMessage, WhatsApp, Telegram, Signal) animates link-preview images. All motion budget goes to the landing page.
- The model generates near 3:2; the OG standard is 1.91:1. The card sits on a gray ground with generous margin, so a center crop is safe. Reported (not Apple-documented) behavior: iOS 16+ gives the full-width bubble treatment only above roughly 2400x1256, below that the card shrinks to a thumbnail; upscale the approved frame to clear that line and verify once on a real device during implementation.
- `og:title` carries the whole first impression besides the image and truncates early on mobile. Keep it short: "Filed for Dad".
- iMessage replaces the URL only when the link is the entire message. The CLI prints a send-ready snippet that keeps the link alone in its own bubble, with the spoken-word code on a separate line for the fallback path.
- Previews cache hard per URL on Apple's side. Regenerating a card for the same person gets a fresh slug (`dad-b`), never an in-place swap.
- iMessage reads plain OG tags in static HTML. No twitter:card block, no JS-rendered metadata.

## Storage and serving

Approved card PNGs are stored in Postgres on the invite row (one bytea column; twelve cards at a few hundred KB each is nothing at this scale). A route serves `GET /i/{slug}/card.png` with long cache headers. No Vercel Blob, no new service, no deploy per invite. The runtime never renders anything; it serves approved bytes.

The existing Satori OG renderer for company cards (`apps/web/src/app/c/[slug]/opengraph-image.tsx`) is out of scope here, with one noted defect filed for later: it declares font families it never embeds, so it renders in a fallback font today.

## The landing page

`/i/{slug}` is a server-rendered page: the card art large, the friend's name, and the same install-and-connect ceremony the `/alpha` page runs today (same fragment-capture script, same sessionStorage key, same external-message path on Chrome, same paste-the-code fallback for Firefox). `/alpha` stays for legacy links.

Motion is CSS-transform only. One designed payoff moment: the wax seal takes its impression when the connect succeeds. No generated video for now; if an ambient clip is ever wanted it is one shared few-second Kling/Veo Lite clip for the page, generated once, never per-invite.

## The code system

- **Word list.** Built once, checked into `packages/core`. EFF methodology: 4 to 8 characters per word, no word is a prefix of another word, profanity-filtered, homophone-culled, phonetically distinct. Target 1,024 to 2,048 words so three words give 30 to 33 bits.
- **Security floor, by citation rather than vibes.** NIST 800-63B requires 20 bits minimum for lookup secrets and mandates rate limiting below 64 bits. RFC 8628 (OAuth device codes), the closest real standard to this flow, targets about 34.5 bits with roughly 5 attempts allowed per code lifetime. Three words clears the NIST floor with margin and sits in RFC 8628 territory.
- **Failure counter.** New: an invite burns (moves to a terminal state) after 5 failed redemption attempts, plus a coarse global failed-attempt circuit breaker on the redeem and inspect routes. Today the 256-bit token is the only brute-force defense; this replaces it honestly.
- **Mint-time hygiene.** Re-roll any code whose three words combine into something rude or confusable (the what3words lesson: clean words still make dirty sentences).
- **Sync points.** The token pattern lives in three places that must change together: server zod schema (`invite-service.ts`), extension parser (`alpha-connect.ts`), invite-page fragment script (`page.tsx`). Legacy base64 tokens stay accepted everywhere.

## Schema changes

Migration 0012 on `alpha_invites`: `slug` (text, unique, nullable for legacy rows), `card_png` (bytea, nullable), `display_name` (text, nullable), `ordinal` (integer), `failed_attempts` (integer, default 0). No changes to installations, allowances, or the reserve/settle path.

## What this deliberately does not do

- No scarcity mechanics. Waitlists, queue positions, and invite quotas are stranger-scale tools; at twelve hand-picked friends they read as performative. The research was unambiguous on this.
- No video or animation in the preview. Impossible on every target messenger.
- No new domain, no URL shortener, no Vercel Blob, no runtime image generation, no Midjourney (no self-serve API), no Sora (sunsetting).
- No change to the connect ceremony, auth model, allowances, or single-use semantics.

## Costs

Per invite: one or two mint calls at about $0.14 each (two candidates per call), so well under a dollar. One-time: word list curation, the migration, and the new page and route. The house style reference already exists.

## Testing

- Unit: word-list invariants (prefix-freedom, length bounds, profanity screen), code generator, combined-code hygiene re-roll, token pattern back-compat (old and new shapes), slug derivation and collision.
- DB suite (`test:alpha-db`): failure counter increments, burn at 5, counter isolation across invites.
- Route: card.png serving, cache headers, unknown slug 404.
- Manual QA loop: send to self, verify full-bleed render on iOS, verify fresh-slug cache busting, verify Firefox paste path with a spoken code.

## Phase 0: done, live, same day

The taste test ran during the design session instead of before the build. Samay generated the winning direction in ChatGPT from an under-specified prompt; Claude then reproduced the iteration loop autonomously through OpenRouter (`google/gemini-3-pro-image`, reference image plus fixed instruction, no human prompting), landing the letterpress revision on the first call for $0.137 total across two candidates. The winning frame is the house style reference and gets checked into the repo with the implementation. The specimen direction (the product's three classification marks pinned like entomology specimens on a tag card) was the runner-up and is recorded here as the alternate if the edition ever wants a second printing.

No open questions remain. Motif is out for v1, the number is open-ended, the direction is the sealed card.

## Research basis

Four parallel research passes on 2026-07-30: consumer invite UX (Partiful, Luma, Arc, Airchat, Wordle, Wrapped), iMessage and messenger preview mechanics, human-friendly code systems and pairing standards (EFF, RFC 8628, NIST, magic-wormhole, what3words), and current image-model capability and pricing (Nano Banana Pro, Recraft, Ideogram, Flux, Imagen, Seedream). Load-bearing claims above marked reported versus confirmed follow the agents' source labels; the full findings live in the session transcript. The two facts most worth re-verifying with a real test before build: the 2400px full-bleed threshold (no Apple primary source) and Nano Banana Pro's pricing and reference-image behavior (vendor page unreachable during research).
