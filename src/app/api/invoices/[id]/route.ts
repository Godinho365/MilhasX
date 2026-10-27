import { route, json, requireUser } from "@/server/http";
import { deleteInvoice } from "@/server/services/extras";

export const DELETE = route(async (req, { params }) => {
  const u = await requireUser(req);
  await deleteInvoice(u.id, (await params).id!);
  return json({ ok: true });
});
