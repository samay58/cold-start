# Exa Websets Contact Enrichment Playbook

Websets is the right comparison point for this failure because it is not just ordinary Exa Search. It creates an async entity collection, verifies each item against criteria, and runs enrichments on matching items. That maps cleanly to "find these people at this company, then enrich work email." Source: [Exa Websets API Guide](https://exa.ai/docs/websets/api-guide)

## What Websets Does That Cold Start Did Not Do

- Websets lets the caller declare entity type and criteria. For this case, the useful shape is a people search with criteria like "person is Sri Viswanath or Amrit Baveja" and "person is currently affiliated with sycamore.so." Cold Start instead used broad source retrieval and only later tried to infer people from accepted sources. Source: [Exa Websets Best Practices](https://exa.ai/docs/websets/best-practices)
- Websets enrichments are typed. `email` is a first-class enrichment format, alongside text, number, date, phone, URL, and options. Cold Start's Direct Exa contact path only extracts emails already present in search-result text, while paid followups are split across Apollo, Minerva, Clado, and Hunter. Source: [Exa Enrichment Docs](https://exa.ai/docs/websets/api/websets/enrichments/get-an-enrichment)
- Websets is async by design. Items can appear first and enrichments can complete later, with polling or webhooks. Cold Start now has a deferred contact-enrichment event, but Sycamore did not dispatch it because the seed card was underfilled and skipped. Source: [Exa Websets Coding Agent Reference](https://exa.ai/docs/websets/api-guide-for-coding-agents)
- Websets can import known URLs and run enrichments over them. That matters because Cold Start already found LinkedIn people URLs for Sycamore, but did not route those URLs through a targeted people-email enrichment pass. Source: [Exa Websets MCP Docs](https://exa.ai/docs/reference/websets-mcp)

## Cost Reality

Websets pricing is credit-based, not AgentCash-based. Public billing says matching all-green results cost credits, email or phone enrichments cost additional credits, and other enrichments have their own lower credit cost. This means Cold Start needs separate Exa/Websets spend telemetry if it integrates Websets; AgentCash wallet deltas will not reconcile Websets credit burn. Source: [Exa Websets Billing](https://websets.exa.ai/billing)

## Product Implication

For Cold Start, the key architecture is targeted people enrichment after leader discovery:

- Build a bounded list of named leaders from cheap evidence: org enrichment, SEC, Direct Exa, accepted LinkedIn people URLs, and LLM-extracted team.
- Run one narrow people/email enrichment job for those exact people, not a generic company-wide people search.
- Accept later completion. Work email should not block first usable card, but it should arrive as a visible "contacts ready" update.
- Track the cost surface separately: AgentCash wallet delta for StableEnrich calls, Exa usage or Websets credits for Websets calls, and Anthropic cost for extraction/synthesis.

---
## Sources

- https://exa.ai/docs/websets/api-guide
- https://exa.ai/docs/websets/best-practices
- https://exa.ai/docs/websets/api/websets/enrichments/get-an-enrichment
- https://exa.ai/docs/websets/api-guide-for-coding-agents
- https://exa.ai/docs/reference/websets-mcp
- https://websets.exa.ai/billing

---
*Captured: 2026-05-27*
