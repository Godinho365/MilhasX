import { route, json, parseBody, requireAdmin } from "@/server/http";
import { promotionSchema } from "@/server/schemas";
import { upsertPromotion } from "@/server/services/extras";

export const POST = route(async (req) => {
  const admin = await requireAdmin(req);
  const b = await parseBody(req, promotionSchema);
  return json({ ok: true, item: await upsertPromotion(admin.id, null, b) }, 201);
});
