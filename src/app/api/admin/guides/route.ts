import { route, json, parseBody, requireAdmin } from "@/server/http";
import { guideSchema } from "@/server/schemas";
import { upsertGuide } from "@/server/services/extras";

export const POST = route(async (req) => {
  const admin = await requireAdmin(req);
  return json({ ok: true, item: await upsertGuide(admin.id, null, await parseBody(req, guideSchema)) }, 201);
});
