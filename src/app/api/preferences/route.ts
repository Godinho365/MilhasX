import { route, json, parseBody, requireUser } from "@/server/http";
import { preferenceSchema } from "@/server/schemas";
import { savePreferences, getPreferences } from "@/server/services/settings";

export const GET = route(async (req) => {
  const u = await requireUser(req);
  return json({ ok: true, item: await getPreferences(u.id) });
});

export const PATCH = route(async (req) => {
  const u = await requireUser(req);
  const b = await parseBody(req, preferenceSchema);
  await savePreferences(u.id, b);
  return json({ ok: true, item: await getPreferences(u.id) });
});
