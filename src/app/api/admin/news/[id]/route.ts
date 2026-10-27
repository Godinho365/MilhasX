import { route, json, parseBody, requireAdmin } from "@/server/http";
import { newsSchema } from "@/server/schemas";
import { upsertNews, deleteNews } from "@/server/services/extras";

export const PATCH = route(async (req, { params }) => {
  const admin = await requireAdmin(req);
  return json({ ok: true, item: await upsertNews(admin.id, (await params).id!, await parseBody(req, newsSchema)) });
});
export const DELETE = route(async (req, { params }) => {
  const admin = await requireAdmin(req);
  await deleteNews(admin.id, (await params).id!);
  return json({ ok: true });
});
