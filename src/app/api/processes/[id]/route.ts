import { route, json, parseBody, requireUser } from "@/server/http";
import { processSchema } from "@/server/schemas";
import { deleteProcess, saveProcess } from "@/server/services/team";

export const PUT = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, processSchema);
  await saveProcess(u.id, (await params).id!, b);
  return json({ ok: true });
});

export const DELETE = route(async (req, { params }) => {
  const u = await requireUser(req);
  await deleteProcess(u.id, (await params).id!);
  return json({ ok: true });
});
