import { route, json, parseBody, requireUser } from "@/server/http";
import { orderSchema } from "@/server/schemas";
import { createOrder, listOrders } from "@/server/services/orders";

export const GET = route(async (req) => {
  const u = await requireUser(req);
  const sp = new URL(req.url).searchParams;
  return json({ ok: true, items: await listOrders(u.id, { archived: sp.get("archived") === "1", q: sp.get("q") || undefined }) });
});

export const POST = route(async (req) => {
  const u = await requireUser(req);
  const b = await parseBody(req, orderSchema);
  return json({ ok: true, item: await createOrder(u.id, { ...b, customerEmail: b.customerEmail || null }) }, 201);
});
