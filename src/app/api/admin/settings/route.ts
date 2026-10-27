import { route, json, parseBody, requireAdmin } from "@/server/http";
import { settingSchema } from "@/server/schemas";
import { getSettings, setSetting } from "@/server/services/admin";

export const GET = route(async (req) => {
  await requireAdmin(req);
  return json({ ok: true, settings: await getSettings() });
});
export const PUT = route(async (req) => {
  const admin = await requireAdmin(req);
  const { key, value } = await parseBody(req, settingSchema);
  await setSetting(admin.id, key, value);
  return json({ ok: true });
});
