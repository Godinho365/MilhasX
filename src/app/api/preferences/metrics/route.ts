import { route, json, parseBody, requireUser } from "@/server/http";
import { metricsHiddenSchema } from "@/server/schemas";
import { metricsHidden, saveMetricsHidden } from "@/server/services/metrics";

// Blocos escondidos na página Métricas (Personalizar)
export const GET = route(async (req) => {
  const u = await requireUser(req);
  return json({ ok: true, item: { hidden: await metricsHidden(u.actor.id) } });
});

export const PUT = route(async (req) => {
  const u = await requireUser(req);
  const b = await parseBody(req, metricsHiddenSchema);
  return json({ ok: true, item: { hidden: await saveMetricsHidden(u.actor.id, b.hidden) } });
});
