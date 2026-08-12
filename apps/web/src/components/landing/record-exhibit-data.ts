// Frozen data for the landing page's record exhibit (docs/superpowers/plans/
// 2026-08-11-landing-exhibit-and-video-bookend.md, "Visual direction, decided 2026-08-12"):
// real PitchBook output as a continuous-feed printout next to real Cold Start output as a
// miniature filed catalogue card, same companies. Reference mockup:
// docs/product/design/2026-08-12-record-exhibit-direction/d1.html.
//
// PitchBook strings were transcribed from Samay's PitchBook access on 2026-08-11 and are
// quoted as editorial content with attribution; re-verify against PitchBook before ship.
// Cold Start excerpt lines are contiguous spans clipped from the live production cards
// (/api/cards/mintlify, /api/cards/turbopuffer, /api/cards/clickhouse; frozen 2026-08-11,
// re-verified against the live cards 2026-08-12 during the printout-and-card rebuild).
// Only the leading capital and terminal punctuation are normalized; no interior word is
// altered, dropped, or reordered. Evidence states were derived through the real card-face
// rules (publicEvidenceStatusForFact in apps/web/src/lib/card-face/model.ts) against each
// fact's citations at freeze time.
//
// Logo URLs are frozen, hand-checked candidates in fallback order; the component vets each
// through safePublicImageUrl at render and falls back to an initial letter. Mintlify's own
// card logoUrl is a 1120x630 OG banner, wrong shape for a small square mark, so its favicon
// leads instead. The two LinkedIn URLs come from the live cards' identity.logoUrl.
//
// Copy slots marked [SAMAY] carry working placeholders only. Samay writes every line that
// ships; nothing here goes to production until he replaces them.
//
// Plain data, no imports: this feeds a client component and must stay inert.

type ExhibitEvidenceState = "verified" | "reported" | "company" | "conflict";

interface ExhibitRecordField {
  label: string;
  value: string;
}

interface ExhibitRecordColumn {
  name: string;
  fields: ExhibitRecordField[];
}

interface ExhibitCardLine {
  text: string;
  state: ExhibitEvidenceState;
  // true = no field on their record holds this line; draws a hand tally stroke.
  tick: boolean;
}

interface ExhibitComp {
  name: string;
  domain: string;
  basis: string;
  state: ExhibitEvidenceState;
  // Hostnames of the citations behind the comp, from the card's ledger.
  sourceHosts: string[];
  tick: boolean;
}

export interface ExhibitPair {
  slug: string;
  company: string;
  // [SAMAY]
  question: string;
  // Frozen, hand-checked logo candidates in fallback order; vetted at render.
  logoUrls: string[];
  record: {
    description?: string;
    fields?: ExhibitRecordField[];
    columns?: ExhibitRecordColumn[];
  };
  // [SAMAY] the one number the two documents disagree on, rendered as a paper slip
  // tucked under the record's bottom edge. Wording is his to finalize.
  noteSlip?: string;
  excerpt: {
    lines: ExhibitCardLine[];
    comps?: ExhibitComp[];
  };
}

export interface RecordExhibitData {
  accessDate: string;
  // Samay's wording, 2026-08-12 review.
  kicker: string;
  // Printed header on the printout itself, naming the source so the strip can never be
  // mistaken for our card (binding decision, 2026-08-12). The access date renders beside it.
  printoutTitle: string;
  stack: Array<{ company: string; text: string }>;
  // [SAMAY]
  recordCaption: string;
  pairs: ExhibitPair[];
  // [SAMAY]
  linkLabel: string;
}

export const recordExhibit: RecordExhibitData = {
  accessDate: "2026-08-11",

  // Samay's line, approved 2026-08-12.
  kicker: "The tools we use to understand these companies barely scratch the surface.",

  printoutTitle: "PitchBook · Company descriptions",

  stack: [
    {
      company: "Exa",
      text: "Developer of an artificial intelligence-powered search engine designed to perform web searches at a large scale."
    },
    {
      company: "Turbopuffer",
      text: "Developer of a serverless vector database designed for the technology and data storage industries."
    },
    {
      company: "ClickHouse",
      text: "Developer of an online analytical processing database management system designed to generate analytical reports using SQL queries."
    },
    {
      company: "Cursor",
      text: "Developer of an artificial intelligence-powered coding platform designed to enhance the productivity and capabilities of programmers and software engineers."
    },
    {
      company: "Ramp",
      text: "Developer of a spend-management platform designed to streamline business, improve efficiency, and build healthier enterprises."
    },
    {
      company: "Mintlify",
      text: "Developer of an intelligent knowledge platform designed to organize, analyze, and surface enterprise knowledge for improved decision-making."
    }
  ],

  // [SAMAY] working placeholder
  recordCaption: "PitchBook, accessed August 11, 2026.",

  pairs: [
    {
      slug: "mintlify",
      company: "Mintlify",
      // [SAMAY] working placeholder
      question: "What do they actually sell?",
      logoUrls: [
        "https://icons.duckduckgo.com/ip3/mintlify.com.ico",
        "https://mintlify.com/favicon.ico"
      ],
      record: {
        description:
          "Developer of an intelligent knowledge platform designed to organize, analyze, and surface enterprise knowledge for improved decision-making.",
        fields: [
          { label: "Employees", value: "62" },
          { label: "Contacts", value: "2" },
          { label: "Deals", value: "5" },
          { label: "Investors", value: "11" },
          { label: "Year founded", value: "2021" },
          { label: "Primary industry", value: "Business/Productivity Software" }
        ]
      },
      // Samay's wording, approved 2026-08-12. LinkedIn showed 82 associated members that
      // day, so 62 is stale and 85 (Apollo, May 2026) is in range; the slip quotes only
      // what the card itself files.
      noteSlip: "They file 62. Our sources file 85 as of May 2026.",
      excerpt: {
        lines: [
          {
            text: "Sells documentation and knowledge infrastructure to software companies.",
            state: "verified",
            tick: false
          },
          {
            text: "Large enterprises including Anthropic, Perplexity, Vercel, Fidelity, and Replit.",
            state: "verified",
            tick: true
          },
          {
            text: "Nearly half of traffic across Mintlify-hosted docs now comes from AI agents rather than human browsers.",
            state: "verified",
            tick: true
          }
        ]
      }
    },
    {
      slug: "turbopuffer",
      company: "turbopuffer",
      // [SAMAY] working placeholder
      question: "Who pays them?",
      logoUrls: [
        "https://media.licdn.com/dms/image/v2/D560BAQG2ZzVa7V9EZw/company-logo_200_200/B56ZgjGvVeHkAI-/0/1752935626434/turbopuffer_logo?e=2147483647&v=beta&t=Vud8jiQiZ7qqdgd8FtR2Z501YJjz9Oe_oDWGvAIwsH8",
        "https://icons.duckduckgo.com/ip3/turbopuffer.com.ico"
      ],
      record: {
        fields: [
          { label: "Employees", value: "22 (as of 2025)" },
          { label: "Total raised", value: "—" },
          { label: "Post valuation", value: "—" },
          { label: "Revenue", value: "—" }
        ]
      },
      excerpt: {
        lines: [
          {
            text: "Anthropic, Cursor, Notion, Atlassian.",
            state: "verified",
            tick: true
          },
          {
            text: "Vector and full-text search on cheap object storage instead of expensive in-memory systems.",
            state: "verified",
            tick: true
          },
          {
            text: "Warm, cached queries return in about 20ms (p50).",
            state: "verified",
            tick: true
          }
        ]
      }
    },
    {
      slug: "clickhouse",
      company: "ClickHouse",
      // [SAMAY] working placeholder
      question: "Who do they compete with?",
      logoUrls: [
        "https://media.licdn.com/dms/image/v2/D4E0BAQEr8RfI76yHEQ/company-logo_200_200/company-logo_200_200/0/1688976507947/clickhouseinc_logo?e=2147483647&v=beta&t=nS2YJwmtRThueeFyvz2lylLEQ-r1eX5Wf1PC8a7JKi0",
        "https://icons.duckduckgo.com/ip3/clickhouse.com.ico"
      ],
      record: {
        columns: [
          {
            name: "Databricks",
            fields: [
              { label: "Employees", value: "9,000" },
              { label: "Total raised", value: "$29.52B" }
            ]
          },
          {
            name: "Anthropic",
            fields: [
              { label: "Employees", value: "5,000" },
              { label: "Total raised", value: "$161.25B" }
            ]
          },
          {
            name: "Grafana Labs",
            fields: [{ label: "Employees", value: "1,600" }]
          }
        ]
      },
      excerpt: {
        lines: [],
        comps: [
          {
            name: "Snowflake",
            domain: "snowflake.com",
            basis: "Named directly as a competitor by Bloomberg and TechCrunch.",
            state: "verified",
            sourceHosts: ["bloomberg.com", "techcrunch.com"],
            tick: true
          },
          {
            name: "Databricks",
            domain: "databricks.com",
            basis: "Same buyer evaluating a data platform for analytics and AI workloads.",
            state: "verified",
            sourceHosts: ["bloomberg.com", "techcrunch.com"],
            tick: true
          },
          {
            name: "Elastic",
            domain: "elastic.co",
            basis: "ClickHouse positions against Elasticsearch for log analytics.",
            state: "company",
            sourceHosts: ["clickhouse.com"],
            tick: true
          },
          {
            name: "LangSmith",
            domain: "smith.langchain.com",
            basis: "Langfuse, acquired by ClickHouse, competes directly with LangSmith.",
            state: "reported",
            sourceHosts: ["techcrunch.com"],
            tick: true
          }
        ]
      }
    }
  ],

  // Samay's wording, 2026-08-12.
  linkLabel: "Open the profile"
};

// Test helper: the count of hand tally strokes the fixture draws. The tally beat itself
// was cut on 2026-08-12; the strokes in the card margins are the only count on the page.
export function exhibitTickCount(data: RecordExhibitData): number {
  return data.pairs.reduce((count, pair) => {
    const lineTicks = pair.excerpt.lines.filter((line) => line.tick).length;
    const compTicks = (pair.excerpt.comps ?? []).filter((comp) => comp.tick).length;
    return count + lineTicks + compTicks;
  }, 0);
}
