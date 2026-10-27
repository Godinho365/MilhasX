import { route, json, parseBody, requireUser } from "@/server/http";
import { alertSchema } from "@/server/schemas";
import { listAlerts, createAlert } from "@/server/services/market";

export const GET = route(async (req) => {
  const u = await requireUser(req);
  return json({ ok: true, items: await listAlerts(u.id) });
});
export const POST = route(async (req) => {
  const u = await requireUser(req);
  const b = await parseBody(req, alertSchema);
  return json({ ok: true, item: await createAlert(u.id, b) }, 201);
});
