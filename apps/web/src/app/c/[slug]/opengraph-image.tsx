import { ImageResponse } from "next/og";
import { getPublicCachedCard } from "../../../lib/cards";
import { buildOpenGraphModel, type OpenGraphFact } from "./opengraph-model";

export const alt = "Cold Start company context card";

export const size = {
  width: 1200,
  height: 630
};

export const contentType = "image/png";

type OpenGraphImageProps = {
  params: Promise<{ slug: string }>;
};

const colors = {
  company: "#9B6A1E",
  field: "#F7F5EE",
  focus: "#D7B84A",
  ink: "#171A1F",
  muted: "#68706A",
  plate: "#FFFDF8",
  reported: "#315F9D",
  rule: "#CCC7B8",
  ruleStrong: "#9C978A",
  verified: "#0E6B5B"
};

const fontSans = "IBM Plex Sans, Arial, sans-serif";
const fontSerif = "IBM Plex Serif, Georgia, serif";
const fontMono = "Berkeley Mono, IBM Plex Mono, monospace";

function SourcePill({ citations }: { citations: number }) {
  return (
    <div
      style={{
        alignItems: "center",
        border: `1px solid ${colors.ruleStrong}`,
        borderRadius: 4,
        color: colors.reported,
        display: "flex",
        fontFamily: fontMono,
        fontSize: 17,
        fontWeight: 600,
        gap: 10,
        lineHeight: 1,
        padding: "11px 14px"
      }}
    >
      <span style={{ background: colors.verified, borderRadius: 2, display: "flex", height: 8, width: 8 }} />
      {citations} {citations === 1 ? "source" : "sources"}
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
          color: colors.muted,
          fontFamily: fontSans,
          fontSize: 14,
          fontWeight: 600,
          letterSpacing: 0,
          lineHeight: 1,
          textTransform: "none"
        }}
      >
        {fact.label}
      </div>
      <div
        style={{
          color: colors.ink,
          display: "flex",
          fontFamily: fontMono,
          fontSize: fact.value.length > 24 ? 21 : 25,
          fontWeight: 600,
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
  const model = buildOpenGraphModel(card, slug);

  return new ImageResponse(
    (
      <div
        style={{
          background: colors.field,
          color: colors.ink,
          display: "flex",
          flexDirection: "column",
          fontFamily: fontSans,
          height: "100%",
          overflow: "hidden",
          padding: "36px 46px 30px",
          position: "relative",
          width: "100%"
        }}
      >
        <div
          style={{
            background: colors.plate,
            border: `1px solid ${colors.rule}`,
            borderRadius: 6,
            display: "flex",
            flexDirection: "column",
            height: "100%",
            padding: "25px 28px 24px",
            position: "relative",
            width: "100%"
          }}
        >
          <div
            style={{
              alignItems: "center",
              display: "flex",
              flexDirection: "row",
              gap: 14,
              height: 40,
              width: "100%"
            }}
          >
            <div
              style={{
                alignItems: "center",
                background: colors.focus,
                border: `1px solid ${colors.ink}`,
                borderRadius: 3,
                display: "flex",
                fontFamily: fontMono,
                fontSize: 13,
                fontWeight: 700,
                height: 32,
                justifyContent: "center",
                letterSpacing: 0,
                width: 32
              }}
            >
              CS
            </div>
            <div
              style={{
                color: colors.ink,
                display: "flex",
                fontFamily: fontSans,
                fontSize: 15,
                fontWeight: 650,
                letterSpacing: 0,
                lineHeight: 1,
                textTransform: "none"
              }}
            >
              Cold Start
            </div>
            <div style={{ flex: 1 }} />
            <div
              style={{
                color: colors.muted,
                display: "flex",
                fontFamily: fontMono,
                fontSize: 16,
                fontWeight: 500,
                letterSpacing: 0,
                lineHeight: 1
              }}
            >
              {model.domainLabel}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              marginTop: 42,
              width: 850
            }}
          >
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
                fontFamily: fontSerif,
                fontSize: 29,
                fontWeight: 400,
                lineHeight: 1.28,
                marginTop: 22,
                maxHeight: 112,
                overflow: "hidden",
                width: 790
              }}
            >
              {model.description}
            </div>
          </div>

          <div
            style={{
              alignItems: "center",
              display: "flex",
              flexDirection: "row",
              gap: 16,
              marginTop: 26
            }}
          >
            <div
              style={{
                alignItems: "center",
                background: colors.field,
                border: `1px solid ${colors.rule}`,
                borderRadius: 4,
                display: "flex",
                fontFamily: fontMono,
                fontSize: 40,
                fontWeight: 700,
                height: 84,
                justifyContent: "center",
                width: 84
              }}
            >
              {model.initial}
            </div>
            <SourcePill citations={model.citations} />
          </div>

          <div
            style={{
              background: colors.plate,
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
            <div style={{ background: colors.verified, display: "flex", flexShrink: 0, height: "100%", width: 12 }} />
            <div style={{ display: "flex", flexDirection: "row", flex: 1 }}>
              {model.facts.map((fact) => (
                <FactCell key={`${fact.label}-${fact.value}`} fact={fact} />
              ))}
            </div>
          </div>

          <div
            style={{
              alignItems: "center",
              display: "flex",
              flexDirection: "row",
              gap: 16,
              height: 34,
              marginTop: 20,
              width: "100%"
            }}
          >
            <div style={{ background: colors.focus, border: `1px solid ${colors.ink}`, borderRadius: 2, display: "flex", height: 12, width: 12 }} />
            <div style={{ background: colors.rule, display: "flex", flex: 1, height: 1 }} />
            <div style={{ color: colors.muted, display: "flex", fontFamily: fontMono, fontSize: 14, fontWeight: 500, letterSpacing: 0 }}>
              <span style={{ fontWeight: 700 }}>Source:</span>&nbsp;{model.sourceSummary}
            </div>
          </div>
        </div>
      </div>
    ),
    size
  );
}
