import { route, json, parseBody, requireUser } from "@/server/http";
import { finPaidSchema } from "@/server/schemas";
import { setFinTxPaid } from "@/server/services/finance";

export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, finPaidSchema);
  await setFinTxPaid(u.id, (await params).id!, b.paid, b.date);
  return json({ ok: true });
});
