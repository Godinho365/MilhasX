import { route, json, parseBody, requireUser } from "@/server/http";
import { telegramCodeSchema } from "@/server/schemas";
import { confirmTelegramCode } from "@/server/services/telegram";

// 2ª etapa do login da conta: o código que chegou no Telegram
export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, telegramCodeSchema);
  return json({ ok: true, item: await confirmTelegramCode(u.id, (await params).id!, b.code) });
});
