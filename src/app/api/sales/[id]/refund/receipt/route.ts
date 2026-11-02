import { route, json, parseBody, requireUser } from "@/server/http";
import { saleRefundReceiptSchema } from "@/server/schemas";
import { receiveRefund } from "@/server/services/sales";

export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, saleRefundReceiptSchema);
  return json({ ok: true, item: await receiveRefund(u.id, (await params).id!, { kind: b.kind, date: b.date }) });
});
