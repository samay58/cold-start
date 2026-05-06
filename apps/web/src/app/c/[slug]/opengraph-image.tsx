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

export default async function Image({ params }: OpenGraphImageProps) {
  const { slug } = await params;
  const card = await getPublicCachedCard(slug);

  const name = card?.identity.name.value ?? slug;
  const description = card?.identity.oneLiner.value ?? defaultDescription;
  const hq = card?.identity.hq.value ? `${card.identity.hq.value.city}, ${card.identity.hq.value.country}` : null;
  const funding = formatMoney(card?.funding.totalRaisedUsd.value ?? null);
  const lastRound = card?.funding.lastRound.value?.name ?? null;
  const status = card?.identity.status ?? "private";
  const facts = [funding, lastRound, hq, status].filter((fact): fact is string => Boolean(fact)).slice(0, 3);

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
          color: "#161616",
          padding: "68px 76px",
          fontFamily: "Arial"
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            color: "#4B5563",
            fontSize: 28,
            letterSpacing: 0
          }}
        >
          <div>Cold Start</div>
          <div>{card?.domain ?? "public company card"}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div
            style={{
              display: "flex",
              color: "#111827",
              fontSize: 84,
              fontWeight: 700,
              lineHeight: 0.96,
              letterSpacing: 0,
              maxWidth: 930
            }}
          >
            {name}
          </div>
          <div
            style={{
              display: "flex",
              color: "#374151",
              fontSize: 34,
              lineHeight: 1.25,
              letterSpacing: 0,
              maxWidth: 900
            }}
          >
            {description}
          </div>
        </div>

        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          {facts.map((fact) => (
            <div
              key={fact}
              style={{
                display: "flex",
                alignItems: "center",
                background: "#ECEBE4",
                color: "#1F2937",
                borderRadius: 8,
                padding: "13px 18px",
                fontSize: 24,
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
