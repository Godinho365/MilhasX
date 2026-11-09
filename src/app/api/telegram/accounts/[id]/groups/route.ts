import { route, json, parseBody, requireUser } from "@/server/http";
import { telegramGroupSchema } from "@/server/schemas";
import { listTelegramGroups, addTelegramGroup } from "@/server/services/telegram";

// Grupos da conta conectada (chosen = já está no Chat Balcões); POST põe mais um grupo no Chat Balcões
export const GET = route(async (req, { params }) => {
  const u = await requireUser(req);
  return json({ ok: true, items: await listTelegramGroups(u.id, (await params).id!) });
});

export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, telegramGroupSchema);
  return json({ ok: true, item: await addTelegramGroup(u.id, (await params).id!, b.groupId) });
});
