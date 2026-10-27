import { route, json, parseBody, requireUser } from "@/server/http";
import { invoiceSchema } from "@/server/schemas";
import { addInvoice } from "@/server/services/extras";

export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  return json({ ok: true, item: await addInvoice(u.id, (await params).id!, await parseBody(req, invoiceSchema)) }, 201);
});
