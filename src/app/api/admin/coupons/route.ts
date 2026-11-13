import { route, json, parseBody, requireAdmin } from "@/server/http";
import { couponSchema } from "@/server/promo-schemas";
import { saveCoupon } from "@/server/services/promo";

export const POST = route(async (req) => {
  const admin = await requireAdmin(req);
  const b = await parseBody(req, couponSchema);
  const c = await saveCoupon(admin.id, null, b);
  return json({ ok: true, id: c.id }, 201);
});
