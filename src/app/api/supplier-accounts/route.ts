import { route, json, parseBody, requireUser } from "@/server/http";
import { supplierAccountSchema } from "@/server/schemas";
import { listSupplierAccounts, upsertSupplierAccount } from "@/server/services/extras";

export const GET = route(async (req) => {
  const u = await requireUser(req);
  const sp = new URL(req.url).searchParams;
  return json({ ok: true, items: await listSupplierAccounts(u.id, { programId: sp.get("programId") || undefined, supplierId: sp.get("supplierId") || undefined }) });
});
export const POST = route(async (req) => {
  const u = await requireUser(req);
  return json({ ok: true, item: await upsertSupplierAccount(u.id, null, await parseBody(req, supplierAccountSchema)) }, 201);
});
