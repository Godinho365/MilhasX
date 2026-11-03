import { route, json, parseBody, requireUser } from "@/server/http";
import { taskSchema } from "@/server/schemas";
import { listTasks, saveTask } from "@/server/services/team";

export const GET = route(async (req) => {
  const u = await requireUser(req);
  const sp = new URL(req.url).searchParams;
  return json({ ok: true, items: await listTasks(u.id, { boardId: sp.get("quadro") || undefined, memberId: sp.get("membro") || undefined, q: sp.get("q") || undefined }) });
});

export const POST = route(async (req) => {
  const u = await requireUser(req);
  const b = await parseBody(req, taskSchema);
  return json({ ok: true, id: await saveTask(u.id, null, b) }, 201);
});
