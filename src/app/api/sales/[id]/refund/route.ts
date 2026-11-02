import { route, json, parseBody, requireUser } from "@/server/http";
import { saleRefundSchema } from "@/server/schemas";
import { refundSale, undoRefund } from "@/server/services/sales";

export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, saleRefundSchema);
  return json({ ok: true, item: await refundSale(u.id, (await params).id!, { feeCents: b.feeCents, date: b.date }) });
});
export const DELETE = route(async (req, { params }) => {
  const u = await requireUser(req);
  return json({ ok: true, item: await undoRefund(u.id, (await params).id!) });
});
