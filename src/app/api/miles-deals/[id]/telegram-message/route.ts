import { route, json, parseBody, requireUser } from "@/server/http";
import { telegramMessageSchema } from "@/server/schemas";
import { sendDealDm } from "@/server/services/telegram";

// Negociação vinda do Chat Balcões: manda a mensagem (ex.: a de emissão) no privado para quem está negociando.
export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, telegramMessageSchema);
  await sendDealDm(u.id, (await params).id!, b.text, { attachTicket: true });
  return json({ ok: true });
});
