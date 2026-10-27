import { publicBrand } from "@/server/session";
import { contractText } from "@/server/services/client-pages";
import { loadOrderPage, OrderShell } from "../../order-page";
import { ContratoView } from "../../pages";

export const dynamic = "force-dynamic";
export const metadata = { title: `Termo de compra e venda — ${publicBrand()}`, robots: { index: false } };

type P = { params: Promise<{ slug: string; token: string }> };

// Página "Assinatura de contrato": o termo de compra e venda do pedido, para o cliente assinar.
export default async function ContratoPage({ params }: P) {
  const { slug, token } = await params;
  const d = await loadOrderPage(slug, token);
  const c = d.branding.design.contrato;
  const text = contractText(c.terms, { name: d.branding.agency, doc: c.agencyDoc, address: c.agencyAddress }, d.order);
  return (
    <OrderShell slug={slug} token={token} what="o termo" data={d}>
      <ContratoView slug={slug} token={token} agency={d.branding.agency} design={c} order={d.order} text={text} />
    </OrderShell>
  );
}
