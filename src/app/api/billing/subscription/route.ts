import { route, json, requireUser } from "@/server/http";
import { cancelSubscription } from "@/server/services/billing-mp";

export const DELETE = route(async (req) => {
  const u = await requireUser(req);
  await cancelSubscription(u.id);
  return json({ ok: true });
});
