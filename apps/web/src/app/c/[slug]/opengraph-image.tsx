import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
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

type OpenGraphFont = {
  data: ArrayBuffer;
  name: string;
  style: "normal";
  weight: 400 | 500 | 700;
};

const colors = {
  copper: "#E95A1A",
  hairline: "#D9D0BF",
  ink: "#101010",
  lensBlue: "#1674FF",
  muted: "#4E5255",
  orange: "#FF4D00",
  paper: "#F8F4EA",
  paperPanel: "#FFF9EF",
  paleOrange: "#FFF0E6",
  stone: "#74736D"
};

let fontPromise: Promise<OpenGraphFont[]> | null = null;

const fontUrls = {
  fraunces400: new URL("./fonts/fraunces-latin-400-normal.ttf", import.meta.url),
  fraunces700: new URL("./fonts/fraunces-latin-700-normal.ttf", import.meta.url),
  mona500: new URL("./fonts/mona-sans-latin-500-normal.ttf", import.meta.url),
  mona700: new URL("./fonts/mona-sans-latin-700-normal.ttf", import.meta.url)
};

async function loadFont(url: URL) {
  const pathname = decodeURIComponent(url.pathname);
  const fileName = basename(pathname);
  const sourceName = fileName.replace(/\.[a-f0-9]+(?=\.ttf$)/, "");
  const candidates = [
    pathname,
    join(process.cwd(), ".next/server/chunks/static/media", fileName),
    join(process.cwd(), "apps/web/.next/server/chunks/static/media", fileName),
    join(process.cwd(), "src/app/c/[slug]/fonts", sourceName),
    join(process.cwd(), "apps/web/src/app/c/[slug]/fonts", sourceName)
  ];

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      const buffer = await readFile(candidate);
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(`Failed to load OG font ${fileName}: ${lastError instanceof Error ? lastError.message : "unknown error"}`);
}

function loadOpenGraphFonts() {
  fontPromise ??= Promise.all([
    loadFont(fontUrls.fraunces400),
    loadFont(fontUrls.fraunces700),
    loadFont(fontUrls.mona500),
    loadFont(fontUrls.mona700)
  ]).then(([fraunces400, fraunces700, mona500, mona700]): OpenGraphFont[] => [
    { data: fraunces400, name: "Fraunces", style: "normal", weight: 400 },
    { data: fraunces700, name: "Fraunces", style: "normal", weight: 700 },
    { data: mona500, name: "Mona Sans", style: "normal", weight: 500 },
    { data: mona700, name: "Mona Sans", style: "normal", weight: 700 }
  ]);

  return fontPromise;
}

function RayMesh() {
  const grayLines = Array.from({ length: 30 }, (_, index) => {
    const x = 205 + index * 6.2;
    const y = 0 + index * 1.6;

    return <line key={`ray-gray-${index}`} x1="360" y1="200" x2={x} y2={y} stroke="#343434" strokeWidth="0.8" opacity={0.22 - index * 0.003} />;
  });
  const orangeLines = Array.from({ length: 28 }, (_, index) => {
    const x = 252 + index * 5.1;
    const y = 112 + index * 1.1;

    return <line key={`ray-orange-${index}`} x1="360" y1="200" x2={x} y2={y} stroke={colors.orange} strokeWidth="1.15" opacity={0.34 - index * 0.006} />;
  });

  return (
    <svg width="410" height="250" viewBox="0 0 410 250" style={{ position: "absolute", right: 0, top: 0 }}>
      <g>{grayLines}</g>
      <g>{orangeLines}</g>
      <path d="M318 142 L410 204 L410 250 L260 250 Z" fill={colors.paper} opacity="0.88" />
    </svg>
  );
}

function HalftonePatch({ left, top }: { left: number; top: number }) {
  const dots = Array.from({ length: 11 * 8 }, (_, index) => {
    const column = index % 11;
    const row = Math.floor(index / 11);
    const radius = Math.max(1.1, 4.8 - row * 0.32 - column * 0.16);

    return <circle key={`dot-${index}`} cx={column * 12 + 8} cy={row * 12 + 8} r={radius} fill={colors.orange} opacity={0.21} />;
  });

  return (
    <svg width="150" height="112" viewBox="0 0 150 112" style={{ position: "absolute", left, top }}>
      {dots}
    </svg>
  );
}

function DotGrid() {
  const dots = Array.from({ length: 12 }, (_, index) => (
    <span
      key={`footer-dot-${index}`}
      style={{
        background: colors.ink,
        borderRadius: 999,
        display: "flex",
        height: 5,
        opacity: 0.9,
        width: 5
      }}
    />
  ));

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 4,
        height: 23,
        width: 23
      }}
    >
      {dots}
    </div>
  );
}

function AccentArrow() {
  return (
    <svg width="46" height="46" viewBox="0 0 46 46" style={{ display: "flex", marginLeft: 38, marginTop: 27 }}>
      <path d="M11 35 L35 11" stroke={colors.orange} strokeWidth="2" fill="none" />
      <path d="M17 11 H35 V29" stroke={colors.orange} strokeWidth="2" fill="none" />
    </svg>
  );
}

function SourcePill({ citations }: { citations: number }) {
  return (
    <div
      style={{
        alignItems: "center",
        border: `1px solid ${colors.lensBlue}`,
        borderRadius: 999,
        color: colors.lensBlue,
        display: "flex",
        fontFamily: "Mona Sans",
        fontSize: 18,
        fontWeight: 700,
        gap: 9,
        lineHeight: 1,
        padding: "11px 15px"
      }}
    >
      <span style={{ background: colors.lensBlue, borderRadius: 999, display: "flex", height: 7, width: 7 }} />
      {citations} {citations === 1 ? "source" : "sources"}
    </div>
  );
}

function FactCell({ fact }: { fact: OpenGraphFact }) {
  return (
    <div
      style={{
        borderLeft: `1px solid ${colors.hairline}`,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        minWidth: 0,
        padding: "19px 22px",
        width: 205
      }}
    >
      <div
        style={{
          color: colors.muted,
          fontFamily: "Mona Sans",
          fontSize: 14,
          fontWeight: 700,
          letterSpacing: 3.4,
          lineHeight: 1,
          textTransform: "uppercase"
        }}
      >
        {fact.label}
      </div>
      <div
        style={{
          color: colors.ink,
          display: "flex",
          fontFamily: "Mona Sans",
          fontSize: fact.value.length > 24 ? 22 : 26,
          fontWeight: 700,
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
  const [card, fonts] = await Promise.all([getPublicCachedCard(slug), loadOpenGraphFonts()]);
  const model = buildOpenGraphModel(card, slug);

  return new ImageResponse(
    (
      <div
        style={{
          background: colors.paper,
          color: colors.ink,
          display: "flex",
          flexDirection: "column",
          fontFamily: "Mona Sans",
          height: "100%",
          overflow: "hidden",
          padding: "38px 50px 30px",
          position: "relative",
          width: "100%"
        }}
      >
        <RayMesh />
        <HalftonePatch left={54} top={415} />

        <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative", width: "100%" }}>
          <div
            style={{
              alignItems: "center",
              display: "flex",
              flexDirection: "row",
              gap: 18,
              height: 54,
              width: "100%"
            }}
          >
            <div
              style={{
                alignItems: "center",
                border: `1px solid ${colors.ink}`,
                borderRadius: 999,
                display: "flex",
                fontFamily: "Mona Sans",
                fontSize: 17,
                fontWeight: 700,
                height: 54,
                justifyContent: "center",
                letterSpacing: 0,
                width: 54
              }}
            >
              CS
            </div>
            <div style={{ background: colors.ink, display: "flex", height: 1, opacity: 0.55, width: 48 }} />
            <div
              style={{
                color: colors.ink,
                display: "flex",
                fontFamily: "Mona Sans",
                fontSize: 15,
                fontWeight: 700,
                letterSpacing: 7,
                lineHeight: 1,
                textTransform: "uppercase"
              }}
            >
              Cold Start Company Card
            </div>
            <div style={{ flex: 1 }} />
            <div
              style={{
                color: colors.stone,
                display: "flex",
                fontFamily: "Mona Sans",
                fontSize: 18,
                fontWeight: 500,
                letterSpacing: 2.2,
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
              marginTop: 34,
              width: 835
            }}
          >
            <div
              style={{
                color: colors.ink,
                display: "flex",
                fontFamily: "Fraunces",
                fontSize: model.titleFontSize,
                fontWeight: 400,
                letterSpacing: 0,
                lineHeight: 0.9,
                maxHeight: 215,
                overflow: "hidden"
              }}
            >
              {model.name}
            </div>
            <div style={{ background: colors.orange, display: "flex", height: 4, marginTop: 18, width: 98 }} />
            <div
              style={{
                color: colors.muted,
                display: "flex",
                fontFamily: "Mona Sans",
                fontSize: 29,
                fontWeight: 500,
                lineHeight: 1.25,
                marginTop: 20,
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
              marginTop: 28
            }}
          >
            <div
              style={{
                alignItems: "center",
                background: colors.paperPanel,
                border: `1px solid ${colors.hairline}`,
                borderRadius: 8,
                display: "flex",
                fontFamily: "Mona Sans",
                fontSize: 42,
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
              background: colors.paperPanel,
              borderBottom: `1px solid ${colors.hairline}`,
              borderTop: `1px solid ${colors.hairline}`,
              display: "flex",
              flexDirection: "row",
              height: 102,
              marginTop: "auto",
              overflow: "hidden",
              width: "100%"
            }}
          >
            <div
              style={{
                background: colors.paleOrange,
                borderRight: `1px solid ${colors.hairline}`,
                display: "flex",
                flexShrink: 0,
                height: "100%",
                overflow: "hidden",
                position: "relative",
                width: 124
              }}
            >
              <HalftonePatch left={-2} top={-10} />
              <AccentArrow />
            </div>
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
              gap: 22,
              height: 34,
              marginTop: 20,
              width: "100%"
            }}
          >
            <DotGrid />
            <div style={{ background: colors.ink, display: "flex", flex: 1, height: 1, opacity: 0.34 }} />
            <div style={{ color: colors.ink, display: "flex", fontFamily: "Mona Sans", fontSize: 15, fontWeight: 500, letterSpacing: 0.4 }}>
              <span style={{ fontWeight: 700 }}>Source:</span>&nbsp;{model.sourceSummary}
            </div>
            <div style={{ color: colors.orange, display: "flex", fontFamily: "Mona Sans", fontSize: 32, fontWeight: 700, lineHeight: 1 }}>
              /
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts
    }
  );
}
