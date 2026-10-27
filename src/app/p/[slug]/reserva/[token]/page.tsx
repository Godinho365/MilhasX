import { notFound } from "next/navigation";
import { appName, publicBrand } from "@/server/session";
import { ownerBranding, publicOrder } from "@/server/services/client-pages";
import { PageShell } from "../../central";
import { bannerUrl } from "@/domain/page-design";
import { ReservaView } from "../../pages";

export const dynamic = "force-dynamic";

type P = { params: Promise<{ slug: string; token: string }> };

export async function generateMetadata({ params }: P) {
  const { slug, token } = await params;
  const r = await publicOrder(slug, token);
  return { title: r ? `Reserva do pedido #${r.order.number} — ${publicBrand()}` : publicBrand(), robots: { index: false } };
}

// Página "Reserva confirmada": localizador, trechos, recado e documentos liberados para o cliente.
export default async function ReservaPage({ params }: P) {
  const { slug, token } = await params;
  const r = await publicOrder(slug, token);
  if (!r) notFound();
  const b = await ownerBranding(r.userId);
  return (
    <PageShell brand={publicBrand()} appName={appName()} bgColor={b.design.bgColor} banner={bannerUrl(slug, b.bannerVersion)}>
      <ReservaView design={b.design.reserva} order={r.order} fileBase={`/api/public/order-file/${token}`} />
    </PageShell>
  );
}
