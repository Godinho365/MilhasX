import { route, json, requireUser } from "@/server/http";
import { trackingQuerySchema, queryObject } from "@/server/schemas";
import { trackingList } from "@/server/services/tracking";

/** Lista de uma aba dos acompanhamentos (?tipo=voos&periodo=proximos|7|30|todos|custom&de=&ate=). */
export const GET = route(async (req) => {
  const u = await requireUser(req);
  const q = trackingQuerySchema.parse(queryObject(req));
  return json({ ok: true, ...(await trackingList(u.id, q.tipo, q.periodo, { from: q.de, to: q.ate })) });
});
