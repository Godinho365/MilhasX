import { route, json, requireUser } from "@/server/http";
import { closeTelegramDm } from "@/server/services/telegram";

// Fecha a conversa no privado aqui (no Telegram ela continua)
export const DELETE = route(async (req, { params }) => {
  const u = await requireUser(req);
  await closeTelegramDm(u.id, (await params).id!);
  return json({ ok: true });
});
