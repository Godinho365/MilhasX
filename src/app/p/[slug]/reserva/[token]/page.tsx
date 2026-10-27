import { publicBrand } from "@/server/session";
import { loadOrderPage, OrderShell } from "../../order-page";
import { ReservaView } from "../../pages";

export const dynamic = "force-dynamic";
export const metadata = { title: `Reserva confirmada — ${publicBrand()}`, robots: { index: false } };

type P = { params: Promise<{ slug: string; token: string }> };

// Página "Reserva confirmada": localizador, acompanhamento no site da companhia, voos e documentos.
export default async function ReservaPage({ params }: P) {
  const { slug, token } = await params;
  const d = await loadOrderPage(slug, token);
  return (
    <OrderShell slug={slug} token={token} what="a reserva" data={d}>
      <ReservaView
        agency={d.branding.agency}
        whatsapp={d.branding.whatsapp}
        design={d.branding.design.reserva}
        order={d.order}
        fileBase={`/api/public/order-file/${token}`}
        links={{ cotacao: d.order.hasProposal ? `/p/${slug}/cotacao/${token}` : null, contrato: `/p/${slug}/contrato/${token}` }}
      />
    </OrderShell>
  );
}
