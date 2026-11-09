import { route, json, parseBody, requireUser } from "@/server/http";
import { telegramPhoneSchema } from "@/server/schemas";
import { telegramStatus, startTelegramLogin } from "@/server/services/telegram";

// Contas do Telegram conectadas; POST começa o login de mais uma (o Telegram manda o código para o número)
export const GET = route(async (req) => {
  const u = await requireUser(req);
  return json({ ok: true, item: await telegramStatus(u.id) });
});

export const POST = route(async (req) => {
  const u = await requireUser(req);
  const b = await parseBody(req, telegramPhoneSchema);
  return json({ ok: true, item: await startTelegramLogin(u.id, b.phone) });
});
