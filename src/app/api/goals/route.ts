import { route, json, parseBody, requireUser } from "@/server/http";
import { goalSchema } from "@/server/schemas";
import { saveGoal } from "@/server/services/team";

export const POST = route(async (req) => {
  const u = await requireUser(req);
  const b = await parseBody(req, goalSchema);
  return json({ ok: true, id: await saveGoal(u.id, null, b) }, 201);
});
