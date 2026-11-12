import { route, json, requireUser } from "@/server/http";
import { telegramEventsSince } from "@/server/services/telegram";

// Chat Balcões em tempo real: o que mudou depois do evento ?after= (a aba que reconectou recupera o que perdeu).
export const GET = route(async (req) => {
  const u = await requireUser(req);
  return json({ ok: true, ...(await telegramEventsSince(u.id, new URL(req.url).searchParams.get("after") ?? "0")) });
});
