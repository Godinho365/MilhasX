import { route, json, parseBody, requireUser } from "@/server/http";
import { showcaseSettingsSchema } from "@/server/schemas";
import { saveShowcaseSettings } from "@/server/services/showcase";

export const PUT = route(async (req) => {
  const u = await requireUser(req);
  await saveShowcaseSettings(u.id, await parseBody(req, showcaseSettingsSchema));
  return json({ ok: true });
});
