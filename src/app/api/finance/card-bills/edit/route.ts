// Editar a fatura do cartão: valor real (o que veio no banco) e vencimento só desta fatura.
import { route, json, parseBody, requireUser } from "@/server/http";
import { cardBillEditSchema } from "@/server/schemas";
import { editCardBill } from "@/server/services/finance";

export const PUT = route(async (req) => {
  const u = await requireUser(req);
  const b = await parseBody(req, cardBillEditSchema);
  await editCardBill(u.id, b.cardId, b.dueDate, { realCents: b.realCents, dueOverride: b.dueOverride });
  return json({ ok: true });
});
