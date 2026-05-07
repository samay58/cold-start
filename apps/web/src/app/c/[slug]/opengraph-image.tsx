import { ImageResponse } from "next/og";
import { getPublicCachedCard } from "../../../lib/cards";

export const alt = "Cold Start company context card";

export const size = {
  width: 1200,
  height: 630
};

export const contentType = "image/png";

type OpenGraphImageProps = {
  params: Promise<{ slug: string }>;
};

const defaultDescription = "Sourced company context card.";

function formatMoney(value: number | null) {
  if (value === null) {
    return null;
  }

  if (value >= 1_000_000_000) {
    return `$${Math.round(value / 100_000_000) / 10}B raised`;
  }

  if (value >= 1_000_000) {
    return `$${Math.round(value / 1_000_000)}M raised`;
  }

  return `$${value.toLocaleString("en-US")} raised`;
}

function imageDescription(card: Awaited<ReturnType<typeof getPublicCachedCard>>) {
  return card?.identity.description?.value?.shortDescription ?? card?.identity.oneLiner.value ?? defaultDescription;
}

export default async function Image({ params }: OpenGraphImageProps) {
  const { slug } = await params;
  const card = await getPublicCachedCard(slug);

  const name = card?.identity.name.value ?? slug;
  const description = imageDescription(card);
  const hq = card?.identity.hq.value ? `${card.identity.hq.value.city}, ${card.identity.hq.value.country}` : null;
  const funding = formatMoney(card?.funding.totalRaisedUsd.value ?? null);
  const lastRound = card?.funding.lastRound.value?.name ?? null;
  const status = card?.identity.status ?? "private";
  const facts = [funding, lastRound, hq, status].filter((fact): fact is string => Boolean(fact)).slice(0, 3);
  const citations = card?.citations.length ?? 0;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#FCFAF5",
          backgroundImage:
            "radial-gradient(ellipse 620px 380px at 78% 14%, rgba(120, 80, 40, 0.075), transparent 65%), radial-gradient(circle 360px at 102% 88%, transparent 48%, rgba(105, 70, 35, 0.11) 54%, rgba(105, 70, 35, 0.07) 60%, transparent 68%)",
          color: "#0E0E0E",
          padding: "48px 56px",
          fontFamily: "Fraunces, Georgia, serif"
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid #0E0E0E",
            paddingBottom: 18,
            color: "#0E0E0E",
            fontFamily: "Mona Sans, Arial, sans-serif",
            fontSize: 22,
            fontWeight: 500,
            letterSpacing: "0.14em"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, border: "1px solid #1674FF", fontFamily: "monospace", fontSize: 13, fontWeight: 700 }}>
              {name.charAt(0).toUpperCase()}
            </div>
            <span>COLD START</span>
            <span style={{ color: "#1674FF" }}>N° {String(citations).padStart(4, "0")}</span>
          </div>
          <div style={{ color: "#5F625C", fontSize: 18, letterSpacing: "0.10em" }}>{card?.domain ?? "public company card"}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 58, height: 58, border: "1px solid #1674FF", fontFamily: "monospace", fontSize: 34, fontWeight: 700 }}>
              {name.charAt(0).toUpperCase()}
            </div>
            <div style={{ color: "#5F625C", fontFamily: "Mona Sans, Arial, sans-serif", fontSize: 18, fontWeight: 500, letterSpacing: "0.14em", textTransform: "uppercase" }}>
              Sourced · {citations} citations
            </div>
          </div>
          <div
            style={{
              display: "flex",
              color: "#0E0E0E",
              fontSize: 98,
              fontWeight: 700,
              lineHeight: 0.86,
              letterSpacing: "-0.03em",
              maxWidth: 930
            }}
          >
            {name}.
          </div>
          <div
            style={{
              display: "flex",
              color: "#0E0E0E",
              fontSize: 30,
              lineHeight: 1.34,
              maxWidth: 900
            }}
          >
            {description}
          </div>
        </div>

        <div style={{ display: "flex", gap: 42, alignItems: "center", borderTop: "1px solid #0E0E0E", paddingTop: 26 }}>
          {facts.map((fact) => (
            <div
              key={fact}
              style={{
                display: "flex",
                alignItems: "center",
                color: "#0E0E0E",
                fontFamily: "Mona Sans, Arial, sans-serif",
                fontSize: 18,
                fontWeight: 500,
                letterSpacing: "0.12em",
                lineHeight: 1
              }}
            >
              {fact}
            </div>
          ))}
        </div>
      </div>
    ),
    size
  );
}
