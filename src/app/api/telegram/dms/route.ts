import { route, json, requireUser } from "@/server/http";
import { listTelegramDms } from "@/server/services/telegram";

// Conversas no privado abertas no Chat Balcões
export const GET = route(async (req) => {
  const u = await requireUser(req);
  return json({ ok: true, items: await listTelegramDms(u.id) });
});
