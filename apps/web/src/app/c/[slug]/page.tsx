import { CardShell } from "@cold-start/ui";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getPublicCachedCard } from "../../../lib/cards";
import { CardTexture } from "../../CardTexture";

type CompanyCardPageProps = {
  params: Promise<{ slug: string }>;
};

const defaultDescription = "Sourced company context card.";
export const revalidate = 15;

const getPublicCardForPage = cache((slug: string) => getPublicCachedCard(slug));

function metadataTitle(name: string) {
  return `${name} | Cold Start`;
}

function metadataDescription(card: Awaited<ReturnType<typeof getPublicCachedCard>>) {
  return card?.identity.description?.value?.shortDescription ?? card?.identity.oneLiner.value ?? defaultDescription;
}

export async function generateMetadata({ params }: CompanyCardPageProps): Promise<Metadata> {
  const { slug } = await params;
  const card = await getPublicCardForPage(slug);
  const name = card?.identity.name.value ?? slug;
  const description = metadataDescription(card);
  const title = metadataTitle(name);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
      images: [`/c/${slug}/opengraph-image`]
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`/c/${slug}/opengraph-image`]
    }
  };
}

export default async function CompanyCardPage({ params }: CompanyCardPageProps) {
  const { slug } = await params;
  const card = await getPublicCardForPage(slug);

  if (!card) {
    notFound();
  }

  return (
    <main className="cs-card-page">
      <CardShell card={card} surface="web" texture={<CardTexture />} />
    </main>
  );
}
