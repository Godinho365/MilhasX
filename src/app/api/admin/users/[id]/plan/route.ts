import { route, json, parseBody, requireAdmin } from "@/server/http";
import { adminPlanSchema } from "@/server/schemas";
import { adminSetPlan } from "@/server/services/settings";

export const PUT = route(async (req, { params }) => {
  const admin = await requireAdmin(req);
  const b = await parseBody(req, adminPlanSchema);
  await adminSetPlan(admin.id, (await params).id!, b.plan, b.interval);
  return json({ ok: true });
});
