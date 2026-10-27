import { route, json, requireUser } from "@/server/http";
import { listNotifications, unreadCount } from "@/server/services/market";

export const GET = route(async (req) => {
  const u = await requireUser(req);
  return json({ ok: true, unread: await unreadCount(u.id), items: await listNotifications(u.id) });
});
