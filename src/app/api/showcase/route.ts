import { route, json, parseBody, requireUser } from "@/server/http";
import { showcaseSchema } from "@/server/schemas";
import { listShowcase, saveShowcaseItem, showcaseCandidates, showcaseSettings } from "@/server/services/showcase";

export const GET = route(async (req) => {
  const u = await requireUser(req);
  const [items, settings, candidates] = await Promise.all([listShowcase(u.id), showcaseSettings(u.id), showcaseCandidates(u.id)]);
  return json({ ok: true, items, settings, candidates });
});
export const POST = route(async (req) => {
  const u = await requireUser(req);
  return json({ ok: true, id: await saveShowcaseItem(u.id, null, await parseBody(req, showcaseSchema)) }, 201);
});
