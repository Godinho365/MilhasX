import { route, json, parseBody, requireUser } from "@/server/http";
import { saleSchema, saleQuerySchema, queryObject } from "@/server/schemas";
import { createSale, listSales, creditIssuer } from "@/server/services/sales";

export const GET = route(async (req) => {
  const u = await requireUser(req);
  const f = saleQuerySchema.parse(queryObject(req));
  return json({ ok: true, items: await listSales(u.id, f) });
});
export const POST = route(async (req) => {
  const u = await requireUser(req);
  const b = await parseBody(req, saleSchema);
  const r = await createSale(u.id, b);
  if (!r.duplicated) await creditIssuer(u.id, r.sale.id, u.actor.memberId); // venda do membro fica em nome dele
  return json({ ok: true, item: r.sale, duplicated: r.duplicated }, r.duplicated ? 200 : 201);
});
