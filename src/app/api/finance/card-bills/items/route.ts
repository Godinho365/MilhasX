// Compras da fatura do cartão: adicionar uma (POST) ou corrigir valor, data e cartão (PATCH; ou tirar do cartão).
import { route, json, parseBody, requireUser } from "@/server/http";
import { billItemAddSchema, billItemEditSchema } from "@/server/schemas";
import { addBillItem, editBillItem } from "@/server/services/finance";

export const POST = route(async (req) => {
  const u = await requireUser(req);
  const b = await parseBody(req, billItemAddSchema);
  await addBillItem(u.id, b);
  return json({ ok: true }, 201);
});

export const PATCH = route(async (req) => {
  const u = await requireUser(req);
  const b = await parseBody(req, billItemEditSchema);
  await editBillItem(u.id, b);
  return json({ ok: true });
});
