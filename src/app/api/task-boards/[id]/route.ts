import { route, json, parseBody, requireUser } from "@/server/http";
import { boardSchema } from "@/server/schemas";
import { deleteBoard, saveBoard } from "@/server/services/team";

export const PUT = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, boardSchema);
  await saveBoard(u.id, (await params).id!, b);
  return json({ ok: true });
});

export const DELETE = route(async (req, { params }) => {
  const u = await requireUser(req);
  await deleteBoard(u.id, (await params).id!);
  return json({ ok: true });
});
