import { route, json, requireUser } from "@/server/http";
import { openDmFromDeal } from "@/server/services/telegram";

// Negociação vinda do Chat Balcões: abre a conversa no privado com quem postou o pedido
export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  return json({ ok: true, item: await openDmFromDeal(u.id, (await params).id!) }, 201);
});
