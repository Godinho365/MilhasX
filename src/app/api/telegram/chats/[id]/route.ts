import { route, json, requireUser } from "@/server/http";
import { removeTelegramGroup } from "@/server/services/telegram";

// Tira o grupo do Chat Balcões (no Telegram você continua no grupo)
export const DELETE = route(async (req, { params }) => {
  const u = await requireUser(req);
  return json({ ok: true, item: await removeTelegramGroup(u.id, (await params).id!) });
});
