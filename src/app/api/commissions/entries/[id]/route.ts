import { route, json, requireUser } from "@/server/http";
import { deleteEntry } from "@/server/services/commissions";
import { can } from "@/domain/permissions";

export const DELETE = route(async (req, { params }) => {
  const u = await requireUser(req);
  await deleteEntry(u.id, (await params).id!, { finance: can(u.actor.permissions, "financeiro", "edit") });
  return json({ ok: true });
});
