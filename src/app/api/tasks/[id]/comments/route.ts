import { route, json, parseBody, requireUser } from "@/server/http";
import { taskCommentSchema } from "@/server/schemas";
import { addTaskComment } from "@/server/services/team";

export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, taskCommentSchema);
  await addTaskComment(u.id, (await params).id!, b.text);
  return json({ ok: true }, 201);
});
