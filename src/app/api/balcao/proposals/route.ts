import { route, json, requireUser } from "@/server/http";
import { balcaoProposals } from "@/server/services/balcao";

// Balcão MilhasX: minhas propostas (pendentes, escolhidas e recusadas) com a oferta e a negociação do CRM Milhas
export const GET = route(async (req) => {
  const u = await requireUser(req);
  return json({ ok: true, items: await balcaoProposals(u.id) });
});
