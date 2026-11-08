// Editar uma compra a partir da fatura do cartão: valor, data e cartão (ou tirar do cartão).
import { route, json, parseBody, requireUser } from "@/server/http";
import { billItemEditSchema } from "@/server/schemas";
import { editBillItem } from "@/server/services/finance";

export const PATCH = route(async (req) => {
  const u = await requireUser(req);
  const b = await parseBody(req, billItemEditSchema);
  await editBillItem(u.id, b);
  return json({ ok: true });
});
