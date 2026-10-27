import { route, json, parseBody, requireUser } from "@/server/http";
import { invoiceIncludedSchema } from "@/server/schemas";
import { deleteInvoice, setInvoicePointsIncluded } from "@/server/services/extras";

export const PATCH = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, invoiceIncludedSchema);
  return json({ ok: true, item: await setInvoicePointsIncluded(u.id, (await params).id!, b.pointsIncluded) });
});

export const DELETE = route(async (req, { params }) => {
  const u = await requireUser(req);
  await deleteInvoice(u.id, (await params).id!);
  return json({ ok: true });
});
