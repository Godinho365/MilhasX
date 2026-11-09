import { route, json, parseBody, requireUser } from "@/server/http";
import { telegramPasswordSchema } from "@/server/schemas";
import { confirmTelegramPassword } from "@/server/services/telegram";

// 3ª etapa do login da conta (se ela tiver): a senha de duas etapas, que não é guardada
export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, telegramPasswordSchema);
  return json({ ok: true, item: await confirmTelegramPassword(u.id, (await params).id!, b.password) });
});
