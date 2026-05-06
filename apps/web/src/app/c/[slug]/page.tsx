import { CardShell } from "@cold-start/ui";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicCachedCard } from "../../../lib/cards";

type CompanyCardPageProps = {
  params: Promise<{ slug: string }>;
};

const defaultDescription = "Sourced company context card.";

function metadataTitle(name: string) {
  return `${name} | Cold Start`;
}

export async function generateMetadata({ params }: CompanyCardPageProps): Promise<Metadata> {
  const { slug } = await params;
  const card = await getPublicCachedCard(slug);
  const name = card?.identity.name.value ?? slug;
  const description = card?.identity.oneLiner.value ?? defaultDescription;
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
  const card = await getPublicCachedCard(slug);

  if (!card) {
    notFound();
  }

  return (
    <main className="cs-card-page">
      <CardShell card={card} surface="web" />
    </main>
  );
}
