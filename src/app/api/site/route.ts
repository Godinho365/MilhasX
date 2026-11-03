import { route, json, parseBody, requireUser } from "@/server/http";
import { siteSaveSchema } from "@/server/schemas";
import { getSite, saveSite } from "@/server/services/site";

export const GET = route(async (req) => {
  const u = await requireUser(req);
  return json({ ok: true, item: await getSite(u.id) });
});
export const PUT = route(async (req) => {
  const u = await requireUser(req);
  return json({ ok: true, item: await saveSite(u.id, await parseBody(req, siteSaveSchema)) });
});
