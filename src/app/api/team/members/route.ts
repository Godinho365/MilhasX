import { route, json, parseBody, requireUser } from "@/server/http";
import { memberSchema } from "@/server/schemas";
import { listMembers, saveMember } from "@/server/services/team";

export const GET = route(async (req) => {
  const u = await requireUser(req);
  return json({ ok: true, items: await listMembers(u.id) });
});

export const POST = route(async (req) => {
  const u = await requireUser(req);
  const b = await parseBody(req, memberSchema);
  return json({ ok: true, id: await saveMember(u.id, null, b) }, 201);
});
