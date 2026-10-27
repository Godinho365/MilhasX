import { notFound } from "next/navigation";
import { publicSalesProfile } from "@/server/services/settings";
import { appName, publicBrand } from "@/server/session";
import { bannerUrl } from "@/domain/page-design";
import { PageShell } from "../central";
import { CaptacaoForm } from "../forms";

export const dynamic = "force-dynamic";

type P = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: P) {
  const p = await publicSalesProfile((await params).slug);
  return { title: p ? `Solicite sua cotação · ${p.displayName} — ${publicBrand()}` : publicBrand(), robots: { index: false } };
}

// "Captação de Viagens": formulário de pedido de cotação em etapas.
export default async function SolicitarPage({ params }: P) {
  const p = await publicSalesProfile((await params).slug);
  if (!p || !p.acceptsOrders) notFound();
  return (
    <PageShell brand={publicBrand()} appName={appName()} bgColor={p.design.bgColor} banner={bannerUrl(p.slug, p.bannerVersion)}>
      <CaptacaoForm slug={p.slug} agency={p.displayName} design={p.design.captacao} whatsapp={p.whatsapp} />
    </PageShell>
  );
}
