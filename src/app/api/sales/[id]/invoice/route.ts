import { route, json, parseBody, requireUser } from "@/server/http";
import { saleInvoiceSchema } from "@/server/schemas";
import { setSaleInvoice } from "@/server/services/finance";

/** Nota fiscal emitida para a venda (número vazio apaga). */
export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, saleInvoiceSchema);
  await setSaleInvoice(u.id, (await params).id!, b);
  return json({ ok: true });
});
