import { route, json, parseBody, requireUser } from "@/server/http";
import { cardBalanceSchema } from "@/server/schemas";
import { setCardBalance } from "@/server/services/extras";

// Pontos já acumulados no cartão (vira "Saldo inicial" na conta que recebe os pontos)
export const PUT = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, cardBalanceSchema);
  return json({ ok: true, item: await setCardBalance(u.id, (await params).id!, { points: b.points, date: new Date(b.date) }) });
});
