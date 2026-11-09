import { route, json, parseBody, requireUser } from "@/server/http";
import { telegramAlertSchema } from "@/server/schemas";
import { saveTelegramAlert, deleteTelegramAlert } from "@/server/services/telegram";

// Muda (nome, palavras, ativo) ou exclui um alerta do Chat Balcões
export const PUT = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, telegramAlertSchema);
  return json({ ok: true, items: await saveTelegramAlert(u.id, (await params).id!, b) });
});

export const DELETE = route(async (req, { params }) => {
  const u = await requireUser(req);
  return json({ ok: true, items: await deleteTelegramAlert(u.id, (await params).id!) });
});
