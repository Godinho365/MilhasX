import { route, json, parseBody, requireUser } from "@/server/http";
import { supplierSchema } from "@/server/schemas";
import { listSuppliers, createSupplier } from "@/server/services/extras";

export const GET = route(async (req) => {
  const u = await requireUser(req);
  return json({ ok: true, items: await listSuppliers(u.id) });
});
export const POST = route(async (req) => {
  const u = await requireUser(req);
  return json({ ok: true, item: await createSupplier(u.id, await parseBody(req, supplierSchema)) }, 201);
});
