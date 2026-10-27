import { route, json, parseBody, requireUser } from "@/server/http";
import { supplierAccountSchema } from "@/server/schemas";
import { upsertSupplierAccount, deleteSupplierAccount } from "@/server/services/extras";

export const PATCH = route(async (req, { params }) => {
  const u = await requireUser(req);
  return json({ ok: true, item: await upsertSupplierAccount(u.id, (await params).id!, await parseBody(req, supplierAccountSchema)) });
});
export const DELETE = route(async (req, { params }) => {
  const u = await requireUser(req);
  await deleteSupplierAccount(u.id, (await params).id!);
  return json({ ok: true });
});
