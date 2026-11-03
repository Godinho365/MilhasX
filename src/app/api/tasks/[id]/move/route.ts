import { route, json, parseBody, requireUser } from "@/server/http";
import { taskMoveSchema } from "@/server/schemas";
import { moveTask } from "@/server/services/team";

export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, taskMoveSchema);
  await moveTask(u.id, (await params).id!, b.status, b.position);
  return json({ ok: true });
});
