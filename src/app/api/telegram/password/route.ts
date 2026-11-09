import { route, json, parseBody, requireUser } from "@/server/http";
import { telegramPasswordSchema } from "@/server/schemas";
import { confirmTelegramPassword } from "@/server/services/telegram";

// 3ª etapa do login (se a conta tiver): a senha de duas etapas, que não é guardada
export const POST = route(async (req) => {
  const u = await requireUser(req);
  const b = await parseBody(req, telegramPasswordSchema);
  return json({ ok: true, item: await confirmTelegramPassword(u.id, b.password) });
});
