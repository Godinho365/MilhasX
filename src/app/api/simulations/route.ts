import { route, json, parseBody, requireUser } from "@/server/http";
import { simulationSchema } from "@/server/schemas";
import { listSimulations, saveSimulation } from "@/server/services/simulations";

export const GET = route(async (req) => {
  const u = await requireUser(req);
  return json({ ok: true, items: await listSimulations(u.id) });
});
export const POST = route(async (req) => {
  const u = await requireUser(req);
  const b = await parseBody(req, simulationSchema);
  return json({ ok: true, item: await saveSimulation(u.id, b) }, 201);
});
