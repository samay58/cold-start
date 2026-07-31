import type { Metadata } from "next";
import React, { cache } from "react";
import { notFound } from "next/navigation";

import { createDb, findAlphaInviteCardBySlug } from "@cold-start/db";

import { webEnv } from "../../../lib/web-env";
import { AlphaInviteClient } from "../../alpha/AlphaInviteClient";
import { fragmentCaptureScript } from "../../alpha/fragment-capture";
import styles from "./invite.module.css";

type PageProps = { params: Promise<{ slug: string }> };

const SLUG_PATTERN = /^[a-z0-9-]{1,64}$/;

const getInviteCard = cache((slug: string) =>
  findAlphaInviteCardBySlug(createDb(webEnv().DATABASE_URL), slug)
);

// The link preview is the whole first impression: plain OG tags in static HTML
// (iMessage reads nothing else), the stored card as the image, a short title.
// The page itself is the same install-and-connect ceremony /alpha runs, with the
// card art above it. Layout polish belongs to a later design pass.
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  if (!SLUG_PATTERN.test(slug)) {
    return { title: "Cold Start" };
  }
  const card = await getInviteCard(slug);
  if (!card) {
    return { title: "Cold Start" };
  }
  const title = `Invitation, for ${card.displayName ?? "you"}`;
  return {
    title,
    description: "Cold Start",
    openGraph: {
      title,
      description: "Cold Start",
      images: [{ url: `/i/${slug}/card.png` }]
    }
  };
}

export default async function InvitePage({ params }: PageProps) {
  const { slug } = await params;
  if (!SLUG_PATTERN.test(slug)) {
    notFound();
  }
  const card = await getInviteCard(slug);
  if (!card) {
    notFound();
  }
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: fragmentCaptureScript() }} />
      <div className={styles.artBand}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={styles.art}
          src={`/i/${slug}/card.png`}
          alt={`Invitation for ${card.displayName ?? "you"}`}
        />
      </div>
      <AlphaInviteClient
        extensionId={process.env.CHROME_EXTENSION_ID?.trim() ?? ""}
        storeUrl={process.env.CHROME_WEB_STORE_URL?.trim() ?? "https://chromewebstore.google.com/"}
      />
    </>
  );
}
