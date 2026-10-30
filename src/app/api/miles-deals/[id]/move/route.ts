import { route, json, parseBody, requireUser } from "@/server/http";
import { dealMoveSchema } from "@/server/schemas";
import { moveDeal } from "@/server/services/miles-deals";

export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, dealMoveSchema);
  return json({ ok: true, item: await moveDeal(u.id, (await params).id!, b.stage, b.position) });
});
