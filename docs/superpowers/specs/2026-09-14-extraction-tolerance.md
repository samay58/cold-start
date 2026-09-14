# Extraction tolerance

A model's formatting mistake must not discard an otherwise usable company profile or spend another model call. This follows the timeout repair and supersedes its reliance on corrective prompting for optional numeric fields.

## Contract

- Normalize explicit USD amounts before validation: quoted integers, correctly grouped thousands, dollar or USD labels, and exact thousand/million/billion suffixes. Expand decimals with integer arithmetic; never round. Accept zero only when explicitly supplied.
- Reject ranges, approximations, foreign currencies, malformed grouping, negative amounts, fractions of a dollar, booleans, objects, and numbers beyond safe integer precision. An unsupported optional amount becomes unknown. Preserve its surrounding funding round when that round remains valid.
- Apply the same boundary to full profiles and background enrichment. Quoted headcounts and founding years accept integer formatting only, with the existing field bounds and required headcount date.
- Validate optional facts against the existing canonical schemas after normalization. Isolate a malformed optional fact rather than rejecting other valid fields. Preserve valid facts, citations, confidence, and source disagreement. Keep core identity validation and final card/citation checks strict.
- Enrichment and storage must retain a good saved fact when the candidate is unknown. Preserve a missing nested round amount only when name and announcement date identify the same round and saved amounts agree. Carry its citations and conservative confidence. Never copy an old amount into a different or undated round. Remap colliding citation IDs before merging refreshed cards so preserved facts retain their original source URLs. Do not change provider routing, database schemas, prompts for investor synthesis, or source attribution.
- Reserve corrective model requests for response problems that remain after deterministic normalization. Those requests still share the existing deadline and bounded validation feedback.

## Verification

Tests must show one model call for harmless formatting or a malformed optional fact; exact conversions without invented values; independent preservation of identity, rounds, and citations; matching full/block behavior; strict irrecoverable response validation; and preservation of saved values during enrichment. Replay frozen real provider outputs locally with controlled malformed fields. Run the full repository gate before release. No paid calls are required for this fix.

## WHERE WE LEFT OFF

Implemented and verified. The final full repository gate passed after the parser, funding preservation, and citation collision repairs. There are 111 passing extraction tests, five focused round-preservation cases, two pipeline preservation cases, and 16 storage tests. Sixteen controlled replays over four frozen Gemini and DeepSeek outputs passed final card validation without paid calls. The preceding parser failed six regression cases; removing round preservation also reproduced the nested amount loss. [Verification record](../../qa/extraction-tolerance-2026-09-14.md).
