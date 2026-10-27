import { route, json, parseBody, requireUser } from "@/server/http";
import { orderArchiveSchema } from "@/server/schemas";
import { archiveOrder, unarchiveOrder } from "@/server/services/orders";

export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, orderArchiveSchema);
  await archiveOrder(u.id, (await params).id!, b.reason);
  return json({ ok: true });
});

export const DELETE = route(async (req, { params }) => {
  const u = await requireUser(req);
  await unarchiveOrder(u.id, (await params).id!);
  return json({ ok: true });
});
