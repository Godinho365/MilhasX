import { route, json, requireUser } from "@/server/http";
import { chatPreviews } from "@/server/services/telegram";

// Chat Balcões: a última mensagem de cada conversa (para a lista de conversas).
export const GET = route(async (req) => {
  const u = await requireUser(req);
  return json({ ok: true, ...(await chatPreviews(u.id)) });
});
