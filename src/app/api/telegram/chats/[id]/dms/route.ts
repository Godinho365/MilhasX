import { route, json, parseBody, requireUser } from "@/server/http";
import { telegramDmOpenSchema } from "@/server/schemas";
import { openTelegramDm } from "@/server/services/telegram";

// Chamar no privado: abre a conversa com quem mandou a mensagem do grupo, pela conta do grupo
export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, telegramDmOpenSchema);
  return json({ ok: true, item: await openTelegramDm(u.id, (await params).id!, b.messageId) }, 201);
});
