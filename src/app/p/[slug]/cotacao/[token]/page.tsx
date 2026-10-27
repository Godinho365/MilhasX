import { notFound } from "next/navigation";
import { appName, publicBrand } from "@/server/session";
import { ownerBranding, publicOrder } from "@/server/services/client-pages";
import { PageShell } from "../../central";
import { bannerUrl } from "@/domain/page-design";
import { CotacaoView } from "../../pages";

export const dynamic = "force-dynamic";

type P = { params: Promise<{ slug: string; token: string }> };

export async function generateMetadata({ params }: P) {
  const { slug, token } = await params;
  const r = await publicOrder(slug, token);
  return { title: r ? `Cotação do pedido #${r.order.number} — ${publicBrand()}` : publicBrand(), robots: { index: false } };
}

// Página "Cotação": o cliente vê as opções anotadas no pedido e aprova pelo WhatsApp.
export default async function CotacaoPage({ params }: P) {
  const { slug, token } = await params;
  const r = await publicOrder(slug, token);
  if (!r) notFound();
  const b = await ownerBranding(r.userId);
  return (
    <PageShell brand={publicBrand()} appName={appName()} bgColor={b.design.bgColor} banner={bannerUrl(slug, b.bannerVersion)}>
      <CotacaoView design={b.design.cotacao} order={r.order} whatsapp={b.whatsapp} />
    </PageShell>
  );
}
