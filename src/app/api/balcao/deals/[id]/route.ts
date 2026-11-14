import { route, json, requireUser } from "@/server/http";
import { balcaoDeal } from "@/server/services/balcao";
import { dealId } from "../ids";

// Balcão MilhasX: a negociação com a conversa (a mesma do bot do Balcão)
export const GET = route(async (req, { params }) => {
  const u = await requireUser(req);
  return json({ ok: true, item: await balcaoDeal(u.id, await dealId(params)) });
});
