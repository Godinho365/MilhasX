import { route, json, parseBody, requireUser } from "@/server/http";
import { saleSchema, saleQuerySchema, queryObject } from "@/server/schemas";
import { createSale, listSales } from "@/server/services/sales";

export const GET = route(async (req) => {
  const u = await requireUser(req);
  const f = saleQuerySchema.parse(queryObject(req));
  return json({ ok: true, items: await listSales(u.id, f) });
});
export const POST = route(async (req) => {
  const u = await requireUser(req);
  const b = await parseBody(req, saleSchema);
  const r = await createSale(u.id, b);
  return json({ ok: true, item: r.sale, duplicated: r.duplicated }, r.duplicated ? 200 : 201);
});
