import { route, json, requireUser } from "@/server/http";
import { disconnectTelegram } from "@/server/services/telegram";

// Desconecta a conta (ou cancela o login em andamento dela)
export const DELETE = route(async (req, { params }) => {
  const u = await requireUser(req);
  return json({ ok: true, item: await disconnectTelegram(u.id, (await params).id!) });
});
