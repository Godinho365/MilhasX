import { route, json, parseBody, requireUser } from "@/server/http";
import { orderMoveSchema } from "@/server/schemas";
import { moveOrder } from "@/server/services/orders";

export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, orderMoveSchema);
  await moveOrder(u.id, (await params).id!, b.stage, b.position);
  return json({ ok: true });
});
