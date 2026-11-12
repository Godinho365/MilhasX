import { route, json, parseBody, requireUser } from "@/server/http";
import { dealMoveSchema } from "@/server/schemas";
import { moveDeal } from "@/server/services/miles-deals";
import { creditIssuer } from "@/server/services/sales";

export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, dealMoveSchema);
  const item = await moveDeal(u.id, (await params).id!, b.stage, b.position);
  await creditIssuer(u.id, item.saleId, u.actor.memberId); // venda lançada por um membro fica em nome dele
  return json({ ok: true, item });
});
