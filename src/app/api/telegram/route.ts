import { route, json, requireUser } from "@/server/http";
import { telegramStatus, disconnectTelegram } from "@/server/services/telegram";

// Situação da conta do Telegram conectada; DELETE desconecta (ou cancela o login em andamento)
export const GET = route(async (req) => {
  const u = await requireUser(req);
  return json({ ok: true, item: await telegramStatus(u.id) });
});

export const DELETE = route(async (req) => {
  const u = await requireUser(req);
  await disconnectTelegram(u.id);
  return json({ ok: true, item: await telegramStatus(u.id) });
});
