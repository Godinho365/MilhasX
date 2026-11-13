import { route, json, parseBody, requireAdmin } from "@/server/http";
import { adminPlanSchema } from "@/server/schemas";
import { adminSetPlan } from "@/server/services/settings";
import { rejectPlanRequest } from "@/server/services/admin-billing";

export const PUT = route(async (req, { params }) => {
  const admin = await requireAdmin(req);
  const b = await parseBody(req, adminPlanSchema);
  await adminSetPlan(admin.id, (await params).id!, b.plan, b.interval);
  return json({ ok: true });
});

// Recusa o pedido de plano do usuário
export const DELETE = route(async (req, { params }) => {
  const admin = await requireAdmin(req);
  await rejectPlanRequest(admin.id, (await params).id!);
  return json({ ok: true });
});
