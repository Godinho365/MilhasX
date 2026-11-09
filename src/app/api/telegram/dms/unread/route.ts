import { route, json, requireUser } from "@/server/http";
import { dmUnread, groupUnread } from "@/server/services/telegram";

// Mensagens não vistas: no privado (e as conversas com contraproposta que voltam a abrir quando a pessoa responde)
// e em cada grupo
export const GET = route(async (req) => {
  const u = await requireUser(req);
  const [items, groups] = await Promise.all([dmUnread(u.id), groupUnread(u.id)]);
  return json({ ok: true, items, groups });
});
