import { route, json, parseBody, requireAdmin } from "@/server/http";
import { guideSchema } from "@/server/schemas";
import { upsertGuide, deleteGuide } from "@/server/services/extras";

export const PATCH = route(async (req, { params }) => {
  const admin = await requireAdmin(req);
  return json({ ok: true, item: await upsertGuide(admin.id, (await params).id!, await parseBody(req, guideSchema)) });
});
export const DELETE = route(async (req, { params }) => {
  const admin = await requireAdmin(req);
  await deleteGuide(admin.id, (await params).id!);
  return json({ ok: true });
});
