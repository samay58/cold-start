// Frozen data for the landing page's record exhibit (docs/superpowers/plans/
// 2026-08-11-landing-exhibit-and-video-bookend.md): real PitchBook output next to real
// Cold Start output for the same companies.
//
// PitchBook strings were transcribed from Samay's PitchBook access on 2026-08-11 and are
// quoted as editorial content with attribution; re-verify against PitchBook before ship.
// Cold Start excerpt lines are contiguous spans clipped from the live production cards
// (/api/cards/mintlify, /api/cards/turbopuffer, /api/cards/clickhouse; frozen 2026-08-11,
// re-verified against the live cards 2026-08-12 after turbopuffer's description refreshed).
// Only the leading capital and terminal punctuation are normalized; no interior word is
// altered, dropped, or reordered. Evidence states were derived through the real card-face
// rules (publicEvidenceStatusForFact in apps/web/src/lib/card-face/model.ts) against each
// fact's citations at freeze time.
//
// Copy slots marked [SAMAY] carry working placeholders only. Samay writes every line that
// ships; nothing here goes to production until he replaces them.
//
// Plain data, no imports: this feeds a client component and must stay inert.

type ExhibitEvidenceState = "verified" | "reported" | "company" | "conflict";

interface ExhibitRecordField {
  label: string;
  value: string;
  // [SAMAY] margin-note slot, rendered in the receipt face beside the field.
  note?: string;
}

interface ExhibitRecordColumn {
  name: string;
  fields: ExhibitRecordField[];
}

interface ExhibitCardLine {
  text: string;
  state: ExhibitEvidenceState;
  // true = no field on the left-side record holds this line; draws a tick.
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
  record: {
    description?: string;
    fields?: ExhibitRecordField[];
    columns?: ExhibitRecordColumn[];
  };
  excerpt: {
    lines: ExhibitCardLine[];
    comps?: ExhibitComp[];
  };
}

export interface RecordExhibitData {
  accessDate: string;
  // [SAMAY]
  kicker: string;
  stack: Array<{ company: string; text: string }>;
  // [SAMAY]
  stackCaption: string;
  // [SAMAY]
  recordCaption: string;
  pairs: ExhibitPair[];
  // [SAMAY]
  tally: string;
  // [SAMAY]
  linkLabel: string;
}

export const recordExhibit: RecordExhibitData = {
  accessDate: "2026-08-11",

  // [SAMAY] working placeholder
  kicker: "The same companies, in both tools.",

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
  stackCaption: "PitchBook company descriptions, accessed August 11, 2026.",

  // [SAMAY] working placeholder
  recordCaption: "PitchBook, accessed August 11, 2026.",

  pairs: [
    {
      slug: "mintlify",
      company: "Mintlify",
      // [SAMAY] working placeholder
      question: "What do they actually sell?",
      record: {
        description:
          "Developer of an intelligent knowledge platform designed to organize, analyze, and surface enterprise knowledge for improved decision-making.",
        fields: [
          {
            label: "Employees",
            value: "62",
            // [SAMAY] working placeholder for the one number the two documents disagree on.
            note: "They file 62. Our sources file 85 as of May 2026. Both values stand."
          },
          { label: "Contacts", value: "2" },
          { label: "Deals", value: "5" },
          { label: "Investors", value: "11" },
          { label: "Year founded", value: "2021" },
          { label: "Primary industry", value: "Business/Productivity Software" }
        ]
      },
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

  // [SAMAY] working placeholder; the count matches the ticks the fixture actually draws.
  tally: "Nine lines. No field on the left for any of them.",

  // [SAMAY] working placeholder
  linkLabel: "Open the full card"
};

export function exhibitTickCount(data: RecordExhibitData): number {
  return data.pairs.reduce((count, pair) => {
    const lineTicks = pair.excerpt.lines.filter((line) => line.tick).length;
    const compTicks = (pair.excerpt.comps ?? []).filter((comp) => comp.tick).length;
    return count + lineTicks + compTicks;
  }, 0);
}
