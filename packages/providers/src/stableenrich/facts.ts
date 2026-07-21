import { domainFromUrl, extractUrlRecords, integerValue, objectRecord, stringRecordValue, stringValue, supportedUrl, truncateText, urlFromDomain } from "../stableenrich-utils";
import type { ProviderFactCandidate, ProviderSource, RetrievalIntent, StableenrichProbe } from "../types";
import { sourceTypeHintForHost, type SignalCategory } from "@cold-start/core";
import { type StableenrichProbeResult, type StableenrichSourcesResult, addStringFact, addUrlFact, isExaSearchProbe, providerFact, providerSourceFromText, stableenrichCitationUrl, stableenrichProbeFailure } from "./core";
import { exaEmailFacts, peopleFacts } from "./people";

export function collectStableenrichSources(
  results: PromiseSettledResult<StableenrichProbeResult>[],
): StableenrichSourcesResult {
  const sources = results.flatMap((result) => {
    if (result.status !== "fulfilled") {
      return [];
    }

    return providerSourcesFromProbeResult(result.value);
  });
  const facts = results.flatMap((result) => {
    if (result.status !== "fulfilled") {
      return [];
    }

    return providerFactsFromProbeResult(result.value);
  });

  const failures = results.flatMap((result) => {
    if (result.status === "fulfilled") {
      return [];
    }

    return stableenrichProbeFailure(result.reason);
  });
  const endpoints = results.map((result) => {
    if (result.status === "fulfilled") {
      return {
        name: result.value.name,
        endpointUrl: result.value.endpointUrl,
        status: "ok" as const,
        sourceCount: providerSourcesFromProbeResult(result.value).length,
        factCount: providerFactsFromProbeResult(result.value).length,
        ...(result.value.durationMs !== undefined ? { durationMs: result.value.durationMs } : {}),
      };
    }

    const failure = stableenrichProbeFailure(result.reason)[0];
    return {
      name: failure?.name ?? "exa_funding_history",
      endpointUrl: failure?.endpointUrl ?? "stableenrich",
      status: "failed" as const,
      sourceCount: 0,
      factCount: 0,
      ...(failure?.error ? { error: failure.error } : {}),
    };
  });

  return { sources, facts, failures, endpoints };
}

function providerSourcesFromProbeResult(result: StableenrichProbeResult): ProviderSource[] {
  const intent = intentForProbe(result.name);
  const sourceType = sourceTypeForProbe(result.name);

  if (isExaSearchProbe(result.name)) {
    const sources = exaResultSources(result.result, { intent, sourceType });
    if (sources.length > 0) {
      return sources;
    }
  }

  // firecrawl_homepage/about/team land here too: the stableenrich.dev firecrawl/scrape
  // endpoint's response is locked to { url, title, content } (verified against its live
  // OpenAPI schema), so there is no metadata or image field to carry through as imageUrl.
  return [
    providerSourceFromText({
      url: `agentcash:${result.name}`,
      title: result.name,
      sourceType,
      rawText: JSON.stringify(result.result),
      ...(intent ? { intent } : {}),
    }),
  ];
}

function providerFactsFromProbeResult(result: StableenrichProbeResult): ProviderFactCandidate[] {
  if (result.name === "org_enrichment") {
    return orgEnrichmentFacts(result);
  }

  if (
    result.name === "apollo_people_search" ||
    result.name === "apollo_people_enrich" ||
    result.name === "clado_contacts_enrich" ||
    result.name === "minerva_enrich" ||
    result.name === "hunter_email_verifier"
  ) {
    return peopleFacts(result);
  }

  if (result.name === "exa_email_search") {
    return exaEmailFacts(result);
  }

  if (result.name === "exa_recent_signals") {
    return signalFacts(result);
  }

  return [];
}

function sourceTypeForProbe(name: StableenrichProbe["name"]): ProviderSource["sourceType"] {
  if (name === "firecrawl_homepage" || name === "firecrawl_about" || name === "firecrawl_team") {
    return "company_site";
  }

  if (isExaSearchProbe(name)) {
    return "news";
  }

  return "enrichment";
}

function intentForProbe(name: StableenrichProbe["name"]): RetrievalIntent {
  switch (name) {
    case "exa_funding_history":
      return "funding";
    case "exa_company_profile":
      return "company_profile";
    case "exa_management_team":
      return "management_team";
    case "exa_recent_signals":
      return "recent_signals";
    case "exa_competition":
      return "comparables";
    case "exa_independent_analysis":
      return "independent_analysis";
    case "exa_customer_proof":
      return "customer_proof";
    case "exa_product_proof":
      return "product_proof";
    case "exa_find_similar":
      return "comparables";
    case "firecrawl_homepage":
      return "homepage";
    case "firecrawl_about":
      return "company_profile";
    case "firecrawl_team":
      return "management_team";
    case "apollo_org_search":
    case "org_enrichment":
      return "firmographics";
    case "apollo_people_search":
    case "apollo_people_enrich":
    case "clado_contacts_enrich":
    case "minerva_enrich":
      return "management_team";
    case "hunter_email_verifier":
      return "email_verification";
    case "exa_email_search":
    case "exa_leader_discovery":
      return "management_team";
    default:
      return "company_profile";
  }
}

function exaResultSources(
  payload: unknown,
  metadata: { intent: RetrievalIntent; sourceType: ProviderSource["sourceType"] },
): ProviderSource[] {
  return extractUrlRecords(payload)
    .map((record) => {
      const url = stringRecordValue(record, "url");
      if (!url) {
        return undefined;
      }

      const publishedAt = stringRecordValue(record, "publishedDate");
      const imageUrl = stringRecordValue(record, "image");
      const host = domainFromUrl(url);
      // Every Exa search probe is tagged "news" by sourceTypeForProbe regardless of what
      // host the result actually landed on (a "founders" query routinely surfaces
      // linkedin.com or github.com). Classify by the resolved result host first so that
      // diversity survives into extraction; fall back to the probe-level default.
      const sourceType = (host ? sourceTypeHintForHost(host) : null) ?? metadata.sourceType;

      return providerSourceFromText({
        url,
        title: stringRecordValue(record, "title") ?? stringRecordValue(record, "name") ?? url,
        sourceType,
        rawText: JSON.stringify(record),
        intent: metadata.intent,
        ...(publishedAt ? { publishedAt } : {}),
        ...(imageUrl ? { imageUrl } : {}),
      });
    })
    .filter((source): source is ProviderSource => source !== undefined);
}

function orgEnrichmentFacts(result: StableenrichProbeResult): ProviderFactCandidate[] {
  const fetchedAt = new Date().toISOString();
  const root = objectRecord(result.result);
  const organization = root ? objectRecord(root.organization) : null;
  if (!organization) {
    return [];
  }

  const domain = stringValue(organization.domain) ?? domainFromUrl(stringValue(organization.website_url));
  const citationUrl = stableenrichCitationUrl(result.endpointUrl, domain);
  const citationTitle = domain ? `Apollo org enrichment for ${domain}` : "Apollo org enrichment";
  const rawText = JSON.stringify(root);
  const facts: ProviderFactCandidate[] = [];

  addStringFact(facts, "identity.name", stringValue(organization.name), result, { citationUrl, citationTitle, fetchedAt, rawText, confidence: "high" });
  addUrlFact(facts, "identity.websiteUrl", stringValue(organization.website_url) ?? urlFromDomain(domain), result, {
    citationUrl,
    citationTitle,
    fetchedAt,
    rawText,
    confidence: "high",
  });
  addUrlFact(facts, "identity.linkedinUrl", stringValue(organization.linkedin_url), result, {
    citationUrl,
    citationTitle,
    fetchedAt,
    rawText,
    confidence: "medium",
  });
  addUrlFact(facts, "identity.logoUrl", stringValue(organization.logo_url), result, {
    citationUrl,
    citationTitle,
    fetchedAt,
    rawText,
    confidence: "medium",
  });

  const city = stringValue(organization.city);
  const country = stringValue(organization.country);
  if (city && country) {
    facts.push(providerFact("identity.hq", { city, country }, result, { citationUrl, citationTitle, fetchedAt, rawText, confidence: "medium" }));
  }

  const foundedYear = integerValue(organization.founded_year);
  if (foundedYear !== null && foundedYear >= 1800 && foundedYear <= 2100) {
    facts.push(providerFact("identity.foundedYear", foundedYear, result, { citationUrl, citationTitle, fetchedAt, rawText, confidence: "medium" }));
  }

  const seoDescription = stringValue(organization.seo_description);
  const shortDescription = stringValue(organization.short_description) ?? seoDescription;
  const expandedDescription = stringValue(organization.description) ?? (seoDescription && seoDescription !== shortDescription ? seoDescription : null);
  if (shortDescription) {
    facts.push(
      providerFact(
        "identity.description",
        {
          shortDescription,
          expandedDescription,
          concept: null,
          serves: null,
          mechanism: null,
        },
        result,
        { citationUrl, citationTitle, fetchedAt, rawText, confidence: "medium" },
      ),
    );
  }

  const totalFunding = integerValue(organization.total_funding);
  if (totalFunding !== null && totalFunding > 0) {
    facts.push(providerFact("funding.totalRaisedUsd", totalFunding, result, { citationUrl, citationTitle, fetchedAt, rawText, confidence: "low" }));
  }

  const latestStage = stringValue(organization.latest_funding_stage);
  const latestDate = stringValue(organization.latest_funding_round_date);
  if (latestStage || latestDate) {
    facts.push(
      providerFact(
        "funding.lastRound",
        {
          name: latestStage ?? "Latest round",
          amountUsd: null,
          announcedAt: latestDate,
          leadInvestors: [],
        },
        result,
        { citationUrl, citationTitle, fetchedAt, rawText, confidence: "low" },
      ),
    );
  }

  const headcount = integerValue(organization.estimated_num_employees);
  if (headcount !== null && headcount >= 0) {
    facts.push(
      providerFact("team.headcount", { value: headcount, asOf: fetchedAt.slice(0, 10) }, result, {
        citationUrl,
        citationTitle,
        fetchedAt,
        rawText,
        confidence: "low",
      }),
    );
  }

  return facts;
}

function signalFacts(result: StableenrichProbeResult): ProviderFactCandidate[] {
  const fetchedAt = new Date().toISOString();
  return extractUrlRecords(result.result).flatMap((record) => {
    const url = stringRecordValue(record, "url");
    if (!url || !supportedUrl(url)) {
      return [];
    }

    const title = stringRecordValue(record, "title") ?? stringRecordValue(record, "name");
    if (!title) {
      return [];
    }

    const text = stringRecordValue(record, "text") ?? stringRecordValue(record, "summary") ?? title;
    const publishedAt = stringRecordValue(record, "publishedDate") ?? stringRecordValue(record, "published_at");
    const sourceDomain = domainFromUrl(url) ?? "source";
    return [
      providerFact(
        "signals",
        {
          title: truncateText(title, 96),
          url,
          date: (publishedAt ?? fetchedAt).slice(0, 10),
          source: sourceDomain,
          category: signalCategory(`${title}\n${text}`),
          citationIds: [],
        },
        result,
        {
          citationUrl: url,
          citationTitle: title,
          fetchedAt,
          rawText: JSON.stringify(record),
          confidence: "medium",
          sourceType: "news",
        },
      ),
    ];
  });
}

function signalCategory(value: string): SignalCategory {
  const normalized = value.toLowerCase();
  if (/\b(funding|raised|series|seed|valuation|investor|round)\b/.test(normalized)) {
    return "funding";
  }
  if (/\b(launch|launches|launched|released|introduces|unveils|announces|ships)\b/.test(normalized)) {
    return "launch";
  }
  if (/\b(hiring|jobs|careers|headcount|recruiting)\b/.test(normalized)) {
    return "hiring";
  }
  if (/\b(github|repository|repo|stars|commit)\b/.test(normalized)) {
    return "github";
  }
  if (/\b(sec|s-1|10-k|10-q|filing)\b/.test(normalized)) {
    return "filing";
  }
  return "news";
}
