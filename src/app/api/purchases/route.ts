import { route, json, parseBody, requireUser } from "@/server/http";
import { purchaseSchema } from "@/server/schemas";
import { createPurchase, listPurchases } from "@/server/services/accounts";

export const GET = route(async (req) => {
  const u = await requireUser(req);
  const s = new URL(req.url).searchParams.get("status");
  const status = s === "PENDING" || s === "RECEIVED" || s === "CANCELED" ? s : undefined;
  return json({ ok: true, items: await listPurchases(u.id, status) });
});
export const POST = route(async (req) => {
  const u = await requireUser(req);
  return json({ ok: true, item: await createPurchase(u.id, await parseBody(req, purchaseSchema)) }, 201);
});
