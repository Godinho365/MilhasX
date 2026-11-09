import { route, json, parseBody, requireUser } from "@/server/http";
import { telegramClearSchema } from "@/server/schemas";
import { clearDmChat } from "@/server/services/telegram";

// Limpa a conversa no privado só no app (até a mensagem upTo; null = mostra tudo de novo). No Telegram nada muda.
export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, telegramClearSchema);
  await clearDmChat(u.id, (await params).id!, b.upTo);
  return json({ ok: true });
});
