import { ImageResponse } from "next/og";
import { getPublicCachedCard } from "../../../lib/cards";
import { buildOpenGraphModel, type OpenGraphFact, type OpenGraphSourceMix } from "./opengraph-model";

export const alt = "Cold Start company context card";

export const size = {
  width: 1200,
  height: 630
};

export const contentType = "image/png";

type OpenGraphImageProps = {
  params: Promise<{ slug: string }>;
};

// Catalogue Card palette (DESIGN.md): parchment on manila ground, one seal accent,
// evidence colors only as small classification marks.
const colors = {
  company: "#9B6A1E",
  ground: "#E4DCC8",
  ink: "#20201E",
  muted: "#6B6256",
  paper: "#F4EDDC",
  reported: "#315F9D",
  rule: "#D8CEB6",
  ruleStrong: "#C3B79A",
  seal: "#6E5C9E",
  verified: "#0E6B5B"
};

const fontSans = "IBM Plex Sans, Arial, sans-serif";
const fontMono = "Berkeley Mono, IBM Plex Mono, monospace";

function ClassificationDot({ kind }: { kind: "independent" | "reporting" | "company" }) {
  const base = {
    borderRadius: 2,
    display: "flex",
    height: 10,
    width: 10
  } as const;

  if (kind === "independent") {
    return <div style={{ ...base, background: colors.verified }} />;
  }

  if (kind === "reporting") {
    return <div style={{ ...base, background: "transparent", border: `2px solid ${colors.reported}` }} />;
  }

  return (
    <div style={{ ...base, border: `2px solid ${colors.company}`, background: "transparent", position: "relative", overflow: "hidden", display: "flex" }}>
      <div style={{ background: colors.company, display: "flex", height: "100%", width: "50%" }} />
    </div>
  );
}

function SourceMixRow({ citations, mix }: { citations: number; mix: OpenGraphSourceMix }) {
  const rows = [
    { count: mix.independent, kind: "independent" as const, label: "verified" },
    { count: mix.reporting, kind: "reporting" as const, label: "reported" },
    { count: mix.company, kind: "company" as const, label: "company" }
  ].filter((row) => row.count > 0);

  return (
    <div style={{ alignItems: "center", display: "flex", flexDirection: "row", gap: 22 }}>
      {rows.map((row) => (
        <div key={row.kind} style={{ alignItems: "center", display: "flex", flexDirection: "row", gap: 9 }}>
          <ClassificationDot kind={row.kind} />
          <div style={{ color: colors.muted, display: "flex", fontFamily: fontSans, fontSize: 17, fontWeight: 500 }}>
            {row.count} {row.label}
          </div>
        </div>
      ))}
      {rows.length === 0 ? (
        <div style={{ color: colors.muted, display: "flex", fontFamily: fontSans, fontSize: 17 }}>
          {citations} {citations === 1 ? "source" : "sources"} on file
        </div>
      ) : null}
    </div>
  );
}

function FactCell({ fact }: { fact: OpenGraphFact }) {
  return (
    <div
      style={{
        borderLeft: `1px solid ${colors.rule}`,
        display: "flex",
        flexDirection: "column",
        gap: 9,
        minWidth: 0,
        padding: "18px 20px",
        width: 214
      }}
    >
      <div
        style={{
          alignItems: "center",
          color: colors.muted,
          display: "flex",
          flexDirection: "row",
          fontFamily: fontSans,
          fontSize: 14,
          fontWeight: 600,
          gap: 8,
          lineHeight: 1
        }}
      >
        {fact.label}
      </div>
      <div
        style={{
          color: colors.ink,
          display: "flex",
          fontFamily: fontSans,
          fontSize: fact.value.length > 14 ? 21 : 25,
          fontWeight: 650,
          lineHeight: 1.1,
          maxHeight: 58,
          overflow: "hidden"
        }}
      >
        {fact.value}
      </div>
    </div>
  );
}

export default async function Image({ params }: OpenGraphImageProps) {
  const { slug } = await params;
  const card = await getPublicCachedCard(slug);
  return renderOpenGraphImage(buildOpenGraphModel(card, slug));
}

// Pure render path, kept separate so the satori output can be exercised without a database.
export function renderOpenGraphImage(model: ReturnType<typeof buildOpenGraphModel>) {
  return new ImageResponse(
    (
      <div
        style={{
          background: colors.ground,
          color: colors.ink,
          display: "flex",
          flexDirection: "column",
          fontFamily: fontSans,
          height: "100%",
          overflow: "hidden",
          padding: "34px 44px 30px",
          position: "relative",
          width: "100%"
        }}
      >
        <div
          style={{
            background: colors.paper,
            border: `1px solid ${colors.ruleStrong}`,
            borderRadius: 6,
            boxShadow: `10px 12px 0 rgba(32, 32, 30, 0.10)`,
            display: "flex",
            flexDirection: "column",
            height: "100%",
            overflow: "hidden",
            position: "relative",
            width: "100%"
          }}
        >
          {/* Seal top edge */}
          <div style={{ background: colors.seal, display: "flex", height: 5, width: "100%" }} />

          <div style={{ display: "flex", flex: 1, flexDirection: "column", padding: "22px 30px 24px" }}>
            <div
              style={{
                alignItems: "flex-start",
                display: "flex",
                flexDirection: "row",
                width: "100%"
              }}
            >
              <div style={{ alignItems: "center", display: "flex", flexDirection: "row", gap: 12 }}>
                <div
                  style={{
                    color: colors.ink,
                    display: "flex",
                    fontFamily: fontSans,
                    fontSize: 17,
                    fontWeight: 700,
                    lineHeight: 1
                  }}
                >
                  Cold Start
                </div>
                <div style={{ color: colors.muted, display: "flex", fontFamily: fontSans, fontSize: 16, lineHeight: 1 }}>
                  Index
                </div>
              </div>
              <div style={{ flex: 1 }} />
              <div style={{ alignItems: "flex-end", display: "flex", flexDirection: "column", gap: 6 }}>
                <div
                  style={{
                    color: colors.seal,
                    display: "flex",
                    fontFamily: fontMono,
                    fontSize: 17,
                    fontWeight: 600,
                    lineHeight: 1
                  }}
                >
                  {model.callNumber}
                </div>
                <div style={{ color: colors.muted, display: "flex", fontFamily: fontMono, fontSize: 13, lineHeight: 1 }}>
                  {model.citations} sources on file
                </div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", marginTop: 30, width: 920 }}>
              {model.filedLabel ? (
                <div
                  style={{
                    alignItems: "center",
                    border: `1px solid ${colors.seal}`,
                    borderRadius: 3,
                    color: colors.seal,
                    display: "flex",
                    fontFamily: fontMono,
                    fontSize: 14,
                    fontWeight: 600,
                    letterSpacing: 1,
                    lineHeight: 1,
                    marginBottom: 18,
                    padding: "7px 10px 6px",
                    alignSelf: "flex-start"
                  }}
                >
                  FILED {model.filedLabel.toUpperCase()}
                </div>
              ) : null}
              <div
                style={{
                  color: colors.ink,
                  display: "flex",
                  fontFamily: fontSans,
                  fontSize: model.titleFontSize,
                  fontWeight: 700,
                  letterSpacing: -1.2,
                  lineHeight: 0.92,
                  maxHeight: 215,
                  overflow: "hidden"
                }}
              >
                {model.name}
              </div>
              <div
                style={{
                  color: colors.ink,
                  display: "flex",
                  fontFamily: fontSans,
                  fontSize: 27,
                  fontWeight: 400,
                  lineHeight: 1.3,
                  marginTop: 18,
                  maxHeight: 110,
                  overflow: "hidden",
                  width: 820
                }}
              >
                {model.description}
              </div>
              <div style={{ display: "flex", marginTop: 18 }}>
                <SourceMixRow citations={model.citations} mix={model.mix} />
              </div>
            </div>

            <div
              style={{
                borderBottom: `1px solid ${colors.rule}`,
                borderTop: `1px solid ${colors.ruleStrong}`,
                display: "flex",
                flexDirection: "row",
                height: 104,
                marginTop: "auto",
                overflow: "hidden",
                width: "100%"
              }}
            >
              {model.facts.map((fact) => (
                <FactCell key={`${fact.label}-${fact.value}`} fact={fact} />
              ))}
              <div style={{ flex: 1 }} />
              {model.citations > 0 ? (
                <div
                  style={{
                    alignItems: "center",
                    alignSelf: "center",
                    border: `2px solid ${colors.seal}`,
                    borderRadius: 4,
                    color: colors.seal,
                    display: "flex",
                    fontFamily: fontMono,
                    fontSize: 16,
                    fontWeight: 700,
                    letterSpacing: 2,
                    lineHeight: 1,
                    marginRight: 18,
                    padding: "9px 12px 8px",
                    transform: "rotate(-5deg)"
                  }}
                >
                  VETTED
                </div>
              ) : null}
            </div>

            <div
              style={{
                alignItems: "center",
                display: "flex",
                flexDirection: "row",
                gap: 16,
                height: 30,
                marginTop: 18,
                width: "100%"
              }}
            >
              <div style={{ color: colors.muted, display: "flex", fontFamily: fontMono, fontSize: 14, lineHeight: 1 }}>
                {model.domainLabel}
              </div>
              <div style={{ background: colors.rule, display: "flex", flex: 1, height: 1 }} />
              <div style={{ color: colors.muted, display: "flex", fontFamily: fontMono, fontSize: 14, fontWeight: 500 }}>
                {model.sourceSummary}
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    size
  );
}
