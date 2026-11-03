import { route, json, parseBody, requireUser } from "@/server/http";
import { taskAssignSchema } from "@/server/schemas";
import { assignTask } from "@/server/services/team";

export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, taskAssignSchema);
  await assignTask(u.id, (await params).id!, b.memberId);
  return json({ ok: true });
});
