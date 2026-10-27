import { route, json, requireUser } from "@/server/http";
import { deleteSimulation } from "@/server/services/simulations";

export const DELETE = route(async (req, { params }) => {
  const u = await requireUser(req);
  await deleteSimulation(u.id, (await params).id!);
  return json({ ok: true });
});
