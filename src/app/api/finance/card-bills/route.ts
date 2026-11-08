// Faturas dos cartões: listar (em aberto e pagas) e marcar como pagas / voltar a em aberto.
import { route, json, parseBody, requireUser } from "@/server/http";
import { cardBillsPaySchema } from "@/server/schemas";
import { listCardBills, setCardBillsPaid } from "@/server/services/finance";

export const GET = route(async (req) => {
  const u = await requireUser(req);
  return json({ ok: true, items: await listCardBills(u.id) });
});

export const POST = route(async (req) => {
  const u = await requireUser(req);
  const b = await parseBody(req, cardBillsPaySchema);
  await setCardBillsPaid(u.id, b.cardId, b.dueDates, b.paid, b.date);
  return json({ ok: true });
});
