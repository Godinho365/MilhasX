import { publicBrand } from "@/server/session";
import { proposalCode } from "@/domain/proposal";
import { loadOrderPage, OrderShell } from "../../order-page";
import { CotacaoView } from "../../pages";

export const dynamic = "force-dynamic";
export const metadata = { title: `Cotação de viagem — ${publicBrand()}`, robots: { index: false } };

type P = { params: Promise<{ slug: string; token: string }> };

// Página "Cotação": voos, bagagem, condições e valores da proposta, com o botão do WhatsApp.
export default async function CotacaoPage({ params }: P) {
  const { slug, token } = await params;
  const d = await loadOrderPage(slug, token);
  return (
    <OrderShell slug={slug} token={token} what="a cotação" data={d}>
      <CotacaoView agency={d.branding.agency} whatsapp={d.branding.whatsapp} design={d.branding.design.cotacao} order={d.order} />
      <span className="sr-only">{proposalCode(d.order.number)}</span>
    </OrderShell>
  );
}
