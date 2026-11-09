import { route, json, requireUser } from "@/server/http";
import { alertFeed } from "@/server/services/telegram";

// Aba Alertas do Chat Balcões: mensagens recentes de todos os chats que dispararam algum alerta
export const GET = route(async (req) => {
  const u = await requireUser(req);
  return json({ ok: true, ...(await alertFeed(u.id)) });
});
