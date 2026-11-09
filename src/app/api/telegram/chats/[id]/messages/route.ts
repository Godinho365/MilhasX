import { route, json, parseBody, requireUser } from "@/server/http";
import { telegramSendSchema } from "@/server/schemas";
import { chatMessages, sendToGroup } from "@/server/services/telegram";

// Mensagens do grupo (Chat Balcões); ?minId= traz só as que chegaram depois. POST manda uma
// mensagem no grupo (escrita pelo usuário).
export const GET = route(async (req, { params }) => {
  const u = await requireUser(req);
  const q = new URL(req.url).searchParams;
  const minId = Number(q.get("minId")) || undefined;
  const limit = Number(q.get("limit")) || undefined;
  return json({ ok: true, items: await chatMessages(u.id, (await params).id!, { minId, limit }) });
});

export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, telegramSendSchema);
  return json({ ok: true, item: await sendToGroup(u.id, (await params).id!, b.text, b.replyTo) }, 201);
});
