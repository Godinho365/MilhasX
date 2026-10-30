import { route, json, parseBody, requireUser } from "@/server/http";
import { saleSchema } from "@/server/schemas";
import { getSale, deleteSale, updateSale } from "@/server/services/sales";

export const GET = route(async (req, { params }) => {
  const u = await requireUser(req);
  return json({ ok: true, item: await getSale(u.id, (await params).id!) });
});
export const PATCH = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, saleSchema);
  return json({ ok: true, item: await updateSale(u.id, (await params).id!, b) });
});
export const DELETE = route(async (req, { params }) => {
  const u = await requireUser(req);
  return json(await deleteSale(u.id, (await params).id!));
});
