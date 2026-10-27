import { route, json, parseBody, requireAdmin } from "@/server/http";
import { newsSchema } from "@/server/schemas";
import { upsertNews } from "@/server/services/extras";

export const POST = route(async (req) => {
  const admin = await requireAdmin(req);
  return json({ ok: true, item: await upsertNews(admin.id, null, await parseBody(req, newsSchema)) }, 201);
});
