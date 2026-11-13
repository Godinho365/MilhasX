import { route, json, parseBody, requireAdmin } from "@/server/http";
import { activeSchema, couponSchema } from "@/server/promo-schemas";
import { saveCoupon, setCouponActive } from "@/server/services/promo";

export const PUT = route(async (req, { params }) => {
  const admin = await requireAdmin(req);
  await saveCoupon(admin.id, (await params).id!, await parseBody(req, couponSchema));
  return json({ ok: true });
});

// Liga ou pausa o cupom (não apaga: as assinaturas continuam ligadas a ele)
export const PATCH = route(async (req, { params }) => {
  const admin = await requireAdmin(req);
  const { active } = await parseBody(req, activeSchema);
  await setCouponActive(admin.id, (await params).id!, active);
  return json({ ok: true });
});
