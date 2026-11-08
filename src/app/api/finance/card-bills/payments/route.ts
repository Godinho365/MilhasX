// Registrar um pagamento (inteiro ou parte) de uma fatura do cartão.
import { route, json, parseBody, requireUser } from "@/server/http";
import { billPaymentSchema } from "@/server/schemas";
import { addBillPayment } from "@/server/services/finance";

export const POST = route(async (req) => {
  const u = await requireUser(req);
  const b = await parseBody(req, billPaymentSchema);
  return json({ ok: true, id: await addBillPayment(u.id, b.cardId, b.dueDate, { paidAt: b.paidAt, amountCents: b.amountCents, accountId: b.accountId }) }, 201);
});
