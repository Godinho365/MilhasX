import { route, json, requireUser } from "@/server/http";
import { dealBuyerData } from "@/server/services/telegram";

// Negociação vinda do Chat Balcões: o que o comprador mandou no privado (passageiros e o link pronto da LATAM). Só lê.
export const GET = route(async (req, { params }) => {
  const u = await requireUser(req);
  return json({ ok: true, item: await dealBuyerData(u.id, (await params).id!) });
});
