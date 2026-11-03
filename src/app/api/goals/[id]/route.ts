import { route, json, parseBody, requireUser } from "@/server/http";
import { goalSchema } from "@/server/schemas";
import { deleteGoal, saveGoal } from "@/server/services/team";

export const PUT = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, goalSchema);
  await saveGoal(u.id, (await params).id!, b);
  return json({ ok: true });
});

export const DELETE = route(async (req, { params }) => {
  const u = await requireUser(req);
  await deleteGoal(u.id, (await params).id!);
  return json({ ok: true });
});
