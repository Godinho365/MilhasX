import { route, json, parseBody, requireUser } from "@/server/http";
import { salePaymentSchema } from "@/server/schemas";
import { setSalePaid } from "@/server/services/sales";

export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, salePaymentSchema);
  return json({ ok: true, item: await setSalePaid(u.id, (await params).id!, b) });
});
