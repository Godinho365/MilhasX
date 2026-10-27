import { route, json, requireUser } from "@/server/http";
import { deletePurchase } from "@/server/services/accounts";

export const DELETE = route(async (req, { params }) => {
  const u = await requireUser(req);
  await deletePurchase(u.id, (await params).id!);
  return json({ ok: true });
});
