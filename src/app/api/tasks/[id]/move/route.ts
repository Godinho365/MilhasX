import { route, json, parseBody, requireUser } from "@/server/http";
import { taskMoveSchema } from "@/server/schemas";
import { moveTask, moveTaskToColumn } from "@/server/services/team";

export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, taskMoveSchema);
  const id = (await params).id!;
  if ("columnId" in b) await moveTaskToColumn(u.id, id, b.columnId, b.position);
  else await moveTask(u.id, id, b.status, b.position);
  return json({ ok: true });
});
