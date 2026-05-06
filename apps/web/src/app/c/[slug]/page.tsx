import { CardShell } from "@cold-start/ui";
import { notFound } from "next/navigation";
import { getPublicCachedCard } from "../../../lib/cards";

export default async function CompanyCardPage({ params }: { params: Promise<{ slug: string }> }) {
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
