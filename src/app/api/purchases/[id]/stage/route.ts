import { route, json, parseBody, requireUser } from "@/server/http";
import { purchaseStageSchema } from "@/server/schemas";
import { movePurchase } from "@/server/services/accounts";

export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, purchaseStageSchema);
  await movePurchase(u.id, (await params).id!, b.stage, b.date);
  return json({ ok: true });
});
