import { route, json, parseBody, requireUser } from "@/server/http";
import { receivePurchaseSchema } from "@/server/schemas";
import { receivePurchase } from "@/server/services/accounts";

export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  return json({ ok: true, item: await receivePurchase(u.id, (await params).id!, await parseBody(req, receivePurchaseSchema)) });
});
