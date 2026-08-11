import type { Metadata } from "next";
import React, { cache } from "react";
import { notFound } from "next/navigation";

import { createDb } from "@cold-start/db";

import { webEnv } from "../../../lib/web-env";
import { AlphaInviteClient } from "../../alpha/AlphaInviteClient";
import { fragmentCaptureScript } from "../../alpha/fragment-capture";
import { lookupAlphaInviteCardForPresentation } from "./invite-card-lookup";
import styles from "./invite.module.css";

type PageProps = { params: Promise<{ slug: string }> };

const LOCATOR_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const getInviteCard = cache((locator: string) =>
  lookupAlphaInviteCardForPresentation(createDb(webEnv().DATABASE_URL), locator)
);

// The link preview is the whole first impression: plain OG tags in static HTML
// (iMessage reads nothing else), the stored card as the image, a short title.
// The page itself is the same install-and-connect ceremony /alpha runs, with the
// card art above it. Layout polish belongs to a later design pass.
// Legacy name-slug links intentionally fall through to generic metadata and the install flow.
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug: locator } = await params;
  if (!LOCATOR_PATTERN.test(locator)) {
    return { title: "Cold Start", robots: { index: false, follow: false }, referrer: "no-referrer" };
  }
  const card = await getInviteCard(locator);
  if (!card) {
    return { title: "Cold Start", robots: { index: false, follow: false }, referrer: "no-referrer" };
  }
  const title = `Invitation, for ${card.displayName ?? "you"}`;
  return {
    title,
    description: "Cold Start",
    robots: { index: false, follow: false },
    referrer: "no-referrer",
    openGraph: {
      title,
      description: "Cold Start",
      images: [{ url: `/i/${locator}/card.png` }]
    }
  };
}

export default async function InvitePage({ params }: PageProps) {
  const { slug: locator } = await params;
  if (!LOCATOR_PATTERN.test(locator)) {
    notFound();
  }
  const card = await getInviteCard(locator);
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: fragmentCaptureScript() }} />
      {card ? (
        <div className={styles.artBand}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={styles.art}
            src={`/i/${locator}/card.png`}
            alt={`Invitation for ${card.displayName ?? "you"}`}
          />
        </div>
      ) : null}
      <AlphaInviteClient
        extensionId={process.env.CHROME_EXTENSION_ID?.trim() ?? ""}
        storeUrl={process.env.CHROME_WEB_STORE_URL?.trim() ?? "https://chromewebstore.google.com/"}
      />
    </>
  );
}
