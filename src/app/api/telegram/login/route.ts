import { route, json, parseBody, requireUser } from "@/server/http";
import { telegramPhoneSchema } from "@/server/schemas";
import { startTelegramLogin } from "@/server/services/telegram";

// 1ª etapa do login: o Telegram manda o código para o número
export const POST = route(async (req) => {
  const u = await requireUser(req);
  const b = await parseBody(req, telegramPhoneSchema);
  return json({ ok: true, item: await startTelegramLogin(u.id, b.phone) });
});
