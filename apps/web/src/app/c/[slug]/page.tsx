import { CardShell } from "@cold-start/ui";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getPublicCachedCardProfile } from "../../../lib/cards";

type CompanyCardPageProps = {
  params: Promise<{ slug: string }>;
};

const defaultDescription = "Sourced company context card.";
export const revalidate = 15;

const getPublicCardForPage = cache((slug: string) => getPublicCachedCardProfile(slug));

function metadataTitle(name: string) {
  return `${name} | Cold Start`;
}

function metadataDescription(card: Awaited<ReturnType<typeof getPublicCardForPage>>) {
  return card?.card.identity.description?.value?.shortDescription ?? card?.card.identity.oneLiner.value ?? defaultDescription;
}

export async function generateMetadata({ params }: CompanyCardPageProps): Promise<Metadata> {
  const { slug } = await params;
  const profile = await getPublicCardForPage(slug);
  const name = profile?.card.identity.name.value ?? slug;
  const description = metadataDescription(profile);
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
  const profile = await getPublicCardForPage(slug);

  if (!profile) {
    notFound();
  }

  return (
    <main className="cs-card-page" id="main-content">
      <CardShell card={profile.card} sections={profile.sections} surface="web" texture={<span aria-hidden="true" className="cs-card-texture" />} />
    </main>
  );
}
