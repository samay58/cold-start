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
          background: "#FAFAF7",
          color: "#0E0E0E",
          padding: "48px 56px",
          fontFamily: "Mona Sans, Arial, sans-serif"
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid #E6DFC9",
            paddingBottom: 18,
            color: "#0E0E0E",
            fontFamily: "Mona Sans, Arial, sans-serif",
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: "0.02em"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, border: "1px solid #1674FF", borderRadius: 8, fontFamily: "monospace", fontSize: 14, fontWeight: 700 }}>
              {name.charAt(0).toUpperCase()}
            </div>
            <span>Cold Start</span>
            <span style={{ color: "#1674FF" }}>{citations} sources</span>
          </div>
          <div style={{ color: "#5F625C", fontSize: 18, letterSpacing: "0.10em" }}>{card?.domain ?? "public company card"}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 64, height: 64, border: "1px solid #1674FF", borderRadius: 12, background: "#FCFAF5", fontFamily: "monospace", fontSize: 34, fontWeight: 700 }}>
              {name.charAt(0).toUpperCase()}
            </div>
            <div style={{ color: "#5F625C", fontFamily: "Mona Sans, Arial, sans-serif", fontSize: 18, fontWeight: 700 }}>
              Sourced profile
            </div>
          </div>
          <div
            style={{
              display: "flex",
              color: "#0E0E0E",
              fontFamily: "Fraunces, Georgia, serif",
              fontSize: 82,
              fontWeight: 700,
              lineHeight: 1,
              letterSpacing: "0",
              maxWidth: 930
            }}
          >
            {name}.
          </div>
          <div
            style={{
              display: "flex",
              color: "#0E0E0E",
              fontSize: 28,
              lineHeight: 1.34,
              maxWidth: 900
            }}
          >
            {description}
          </div>
        </div>

        <div style={{ display: "flex", gap: 14, alignItems: "center", borderTop: "1px solid #E6DFC9", paddingTop: 24 }}>
          {facts.map((fact) => (
            <div
              key={fact}
              style={{
                display: "flex",
                alignItems: "center",
                border: "1px solid #E6DFC9",
                borderRadius: 12,
                color: "#0E0E0E",
                fontFamily: "Mona Sans, Arial, sans-serif",
                fontSize: 18,
                fontWeight: 700,
                lineHeight: 1,
                padding: "14px 16px"
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
