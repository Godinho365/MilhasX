import { route, json, parseBody, requireUser } from "@/server/http";
import { telegramGroupSchema } from "@/server/schemas";
import { listTelegramGroups, chooseTelegramGroup } from "@/server/services/telegram";

// Grupos da conta conectada; POST escolhe o grupo do balcão
export const GET = route(async (req) => {
  const u = await requireUser(req);
  return json({ ok: true, items: await listTelegramGroups(u.id) });
});

export const POST = route(async (req) => {
  const u = await requireUser(req);
  const b = await parseBody(req, telegramGroupSchema);
  return json({ ok: true, item: await chooseTelegramGroup(u.id, b.groupId) });
});
