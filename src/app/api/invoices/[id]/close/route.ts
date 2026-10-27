import { route, json, requireUser } from "@/server/http";
import { closeInvoice } from "@/server/services/extras";

export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  return json({ ok: true, item: await closeInvoice(u.id, (await params).id!) });
});
