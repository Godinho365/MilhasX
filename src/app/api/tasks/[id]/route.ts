import { route, json, parseBody, requireUser } from "@/server/http";
import { taskSchema } from "@/server/schemas";
import { deleteTask, saveTask, taskDetail } from "@/server/services/team";

export const GET = route(async (req, { params }) => {
  const u = await requireUser(req);
  return json({ ok: true, ...(await taskDetail(u.id, (await params).id!)) });
});

export const PUT = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, taskSchema);
  await saveTask(u.id, (await params).id!, b);
  return json({ ok: true });
});

export const DELETE = route(async (req, { params }) => {
  const u = await requireUser(req);
  await deleteTask(u.id, (await params).id!);
  return json({ ok: true });
});
