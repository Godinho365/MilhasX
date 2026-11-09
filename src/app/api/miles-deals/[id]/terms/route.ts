import { route, json, parseBody, requireUser } from "@/server/http";
import { dealTermsSchema } from "@/server/schemas";
import { markDealTermsSent } from "@/server/services/miles-deals";
import { sendDealTerms } from "@/server/services/telegram";

// Termo de emissão: com o texto, manda no privado do Telegram para quem está negociando (pedido do Chat Balcões);
// sem, só anota que foi mandado por fora (copiado ou pelo WhatsApp).
export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  const id = (await params).id!;
  const b = await parseBody(req, dealTermsSchema);
  return json({ ok: true, item: b.text ? await sendDealTerms(u.id, id, b.text) : await markDealTermsSent(u.id, id) });
});
