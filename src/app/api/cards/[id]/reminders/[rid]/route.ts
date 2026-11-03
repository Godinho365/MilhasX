import { route, json, requireUser } from "@/server/http";
import { deleteCardReminder } from "@/server/services/card-details";

export const DELETE = route(async (req, { params }) => {
  const u = await requireUser(req);
  const p = await params;
  await deleteCardReminder(u.id, p.id!, p.rid!);
  return json({ ok: true });
});
