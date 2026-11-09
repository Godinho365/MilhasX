import { route, json, parseBody, requireUser } from "@/server/http";
import { telegramAlertSchema } from "@/server/schemas";
import { listTelegramAlerts, saveTelegramAlert } from "@/server/services/telegram";

// Alertas do Chat Balcões (palavras que destacam e avisam das mensagens dos grupos)
export const GET = route(async (req) => {
  const u = await requireUser(req);
  return json({ ok: true, items: await listTelegramAlerts(u.id) });
});

export const POST = route(async (req) => {
  const u = await requireUser(req);
  const b = await parseBody(req, telegramAlertSchema);
  return json({ ok: true, items: await saveTelegramAlert(u.id, null, b) }, 201);
});
