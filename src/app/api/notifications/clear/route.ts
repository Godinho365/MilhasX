import { route, json, requireUser } from "@/server/http";
import { clearNotifications } from "@/server/services/market";

export const POST = route(async (req) => {
  const u = await requireUser(req);
  await clearNotifications(u.id);
  return json({ ok: true });
});
