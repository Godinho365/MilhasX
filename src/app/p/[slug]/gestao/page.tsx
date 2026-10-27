import { notFound } from "next/navigation";
import { publicSalesProfile } from "@/server/services/settings";
import { appName, publicBrand } from "@/server/session";
import { bannerUrl } from "@/domain/page-design";
import { PageShell } from "../central";
import { GestaoForm } from "../forms";

export const dynamic = "force-dynamic";

type P = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: P) {
  const p = await publicSalesProfile((await params).slug);
  return { title: p ? `Interesse em Gestão de Milhas · ${p.displayName} — ${publicBrand()}` : publicBrand(), robots: { index: false } };
}

// "Interesse em Gestão": contato, programas e renda de quem quer a assessoria de milhas.
export default async function GestaoPage({ params }: P) {
  const p = await publicSalesProfile((await params).slug);
  if (!p || !p.acceptsLeads) notFound();
  return (
    <PageShell brand={publicBrand()} appName={appName()} bgColor={p.design.bgColor} banner={bannerUrl(p.slug, p.bannerVersion)}>
      <GestaoForm slug={p.slug} agency={p.displayName} design={p.design.gestao} whatsapp={p.whatsapp} />
    </PageShell>
  );
}
