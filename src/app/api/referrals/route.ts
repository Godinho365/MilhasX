import { route, json, requireUser } from "@/server/http";
import { referralState } from "@/server/services/settings";

export const GET = route(async (req) => {
  const u = await requireUser(req);
  return json({ ok: true, item: await referralState(u.id) });
});
