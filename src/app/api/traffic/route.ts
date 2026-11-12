import { route, json, requireUser } from "@/server/http";
import { trafficQuerySchema, queryObject } from "@/server/schemas";
import { trafficReport } from "@/server/services/traffic";

/** Relatório dos anúncios do Meta (?periodo=hoje|ontem|7|30|custom&de=&ate=&nivel=campaign|adset|ad&conta=act_..&atualizar=1). */
export const GET = route(async (req) => {
  const u = await requireUser(req);
  const q = trafficQuerySchema.parse(queryObject(req));
  return json({ ok: true, ...(await trafficReport(u.id, { period: q.periodo, since: q.de, until: q.ate, level: q.nivel, account: q.conta, refresh: q.atualizar === "1" })) });
});
