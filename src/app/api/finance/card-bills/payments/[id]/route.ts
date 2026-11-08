// Corrigir (data, valor, conta) ou apagar um pagamento de fatura do cartão.
import { route, json, parseBody, requireUser } from "@/server/http";
import { billPaymentUpdateSchema } from "@/server/schemas";
import { deleteBillPayment, updateBillPayment } from "@/server/services/finance";

export const PUT = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, billPaymentUpdateSchema);
  await updateBillPayment(u.id, (await params).id!, { paidAt: b.paidAt, amountCents: b.amountCents, accountId: b.accountId });
  return json({ ok: true });
});

export const DELETE = route(async (req, { params }) => {
  const u = await requireUser(req);
  await deleteBillPayment(u.id, (await params).id!);
  return json({ ok: true });
});
