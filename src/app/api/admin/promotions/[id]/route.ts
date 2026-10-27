import { route, json, parseBody, requireAdmin } from "@/server/http";
import { promotionSchema } from "@/server/schemas";
import { upsertPromotion, deletePromotion } from "@/server/services/extras";

export const PATCH = route(async (req, { params }) => {
  const admin = await requireAdmin(req);
  const b = await parseBody(req, promotionSchema);
  return json({ ok: true, item: await upsertPromotion(admin.id, (await params).id!, b) });
});
export const DELETE = route(async (req, { params }) => {
  const admin = await requireAdmin(req);
  await deletePromotion(admin.id, (await params).id!);
  return json({ ok: true });
});
