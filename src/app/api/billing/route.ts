import { route, json, parseBody, requireUser } from "@/server/http";
import { planRequestSchema } from "@/server/schemas";
import { billingState, requestPlan, cancelPlanRequest } from "@/server/services/settings";

export const GET = route(async (req) => {
  const u = await requireUser(req);
  return json({ ok: true, item: await billingState(u.id) });
});

// Pedido de troca de plano; a ativação é feita pela administração
export const POST = route(async (req) => {
  const u = await requireUser(req);
  const b = await parseBody(req, planRequestSchema);
  await requestPlan(u.id, b.plan, b.interval);
  return json({ ok: true, item: await billingState(u.id) }, 201);
});

export const DELETE = route(async (req) => {
  const u = await requireUser(req);
  await cancelPlanRequest(u.id);
  return json({ ok: true });
});
