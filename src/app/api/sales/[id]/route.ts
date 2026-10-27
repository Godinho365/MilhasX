import { route, json, requireUser } from "@/server/http";
import { getSale, deleteSale } from "@/server/services/sales";

export const GET = route(async (req, { params }) => {
  const u = await requireUser(req);
  return json({ ok: true, item: await getSale(u.id, (await params).id!) });
});
export const DELETE = route(async (req, { params }) => {
  const u = await requireUser(req);
  return json(await deleteSale(u.id, (await params).id!));
});
