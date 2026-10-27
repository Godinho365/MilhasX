import { route, json, parseBody, requireUser } from "@/server/http";
import { orderSchema } from "@/server/schemas";
import { getOrder, updateOrder, deleteOrder } from "@/server/services/orders";

export const GET = route(async (req, { params }) => {
  const u = await requireUser(req);
  return json({ ok: true, item: await getOrder(u.id, (await params).id!) });
});

export const PUT = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, orderSchema);
  return json({ ok: true, item: await updateOrder(u.id, (await params).id!, { ...b, customerEmail: b.customerEmail || null }) });
});

export const DELETE = route(async (req, { params }) => {
  const u = await requireUser(req);
  await deleteOrder(u.id, (await params).id!);
  return json({ ok: true });
});
