import { route, json, parseBody, requireUser } from "@/server/http";
import { customerSchema } from "@/server/schemas";
import { listCustomers, saveCustomer } from "@/server/services/market";

export const GET = route(async (req) => {
  const u = await requireUser(req);
  return json({ ok: true, items: await listCustomers(u.id) });
});
export const POST = route(async (req) => {
  const u = await requireUser(req);
  const b = await parseBody(req, customerSchema);
  return json({ ok: true, item: await saveCustomer(u.id, null, b) }, 201);
});
