import { route, json, requireUser } from "@/server/http";
import { cancelPurchase } from "@/server/services/accounts";

export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  await cancelPurchase(u.id, (await params).id!);
  return json({ ok: true });
});
