import { route, json, requireUser } from "@/server/http";
import { balcaoOffers } from "@/server/services/balcao";

// Balcão MilhasX: ofertas abertas (?programa=latam&pagina=2) com a análise de emissão e a minha proposta
export const GET = route(async (req) => {
  const u = await requireUser(req);
  const q = new URL(req.url).searchParams;
  const page = Number(q.get("pagina") || 1);
  return json({ ok: true, item: await balcaoOffers(u.id, { program: q.get("programa"), page: Number.isInteger(page) && page > 0 ? page : 1 }) });
});
