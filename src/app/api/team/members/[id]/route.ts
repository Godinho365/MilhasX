import { route, json, parseBody, requireUser } from "@/server/http";
import { memberSchema } from "@/server/schemas";
import { deleteMember, saveMember } from "@/server/services/team";

export const PUT = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, memberSchema);
  await saveMember(u.id, (await params).id!, b);
  return json({ ok: true });
});

export const DELETE = route(async (req, { params }) => {
  const u = await requireUser(req);
  await deleteMember(u.id, (await params).id!);
  return json({ ok: true });
});
