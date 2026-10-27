import { route, json, requireUser } from "@/server/http";
import { markAllRead } from "@/server/services/market";

export const POST = route(async (req) => {
  const u = await requireUser(req);
  await markAllRead(u.id);
  return json({ ok: true });
});
