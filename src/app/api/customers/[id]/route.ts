import { route, json, parseBody, requireUser } from "@/server/http";
import { customerSchema } from "@/server/schemas";
import { saveCustomer, deleteCustomer } from "@/server/services/market";

export const PATCH = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, customerSchema);
  return json({ ok: true, item: await saveCustomer(u.id, (await params).id!, b) });
});
export const DELETE = route(async (req, { params }) => {
  const u = await requireUser(req);
  await deleteCustomer(u.id, (await params).id!);
  return json({ ok: true });
});
