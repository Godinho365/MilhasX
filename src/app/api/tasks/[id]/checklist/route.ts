import { route, json, parseBody, requireUser } from "@/server/http";
import { checklistToggleSchema } from "@/server/schemas";
import { toggleChecklist } from "@/server/services/team";

export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, checklistToggleSchema);
  await toggleChecklist(u.id, (await params).id!, b.index, b.done);
  return json({ ok: true });
});
