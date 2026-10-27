import { route, json, requireUser } from "@/server/http";
import { listNews, unreadNews } from "@/server/services/extras";

export const GET = route(async (req) => {
  const u = await requireUser(req);
  return json({ ok: true, unread: await unreadNews(u.id), items: await listNews() });
});
