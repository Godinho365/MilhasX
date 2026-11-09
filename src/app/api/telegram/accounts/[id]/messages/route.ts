import { route, json, requireUser } from "@/server/http";
import { chatMessages } from "@/server/services/telegram";

// Mensagens do grupo do balcão da conta (Chat Balcões); ?minId= traz só as que chegaram depois
export const GET = route(async (req, { params }) => {
  const u = await requireUser(req);
  const q = new URL(req.url).searchParams;
  const minId = Number(q.get("minId")) || undefined;
  const limit = Number(q.get("limit")) || undefined;
  return json({ ok: true, items: await chatMessages(u.id, (await params).id!, { minId, limit }) });
});
