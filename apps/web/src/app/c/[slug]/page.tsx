import { publicCard } from "@cold-start/core";
import { CardShell } from "@cold-start/ui";
import { notFound } from "next/navigation";
import { getCachedCard } from "../../../inngest/functions";

export const experimental_ppr = true;

export default async function CompanyCardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const card = await getCachedCard(slug);

  if (!card) {
    notFound();
  }

  return (
    <main className="cs-card-page">
      <CardShell card={publicCard(card)} surface="web" />
    </main>
  );
}
