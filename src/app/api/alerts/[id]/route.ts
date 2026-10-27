import { route, json, requireUser } from "@/server/http";
import { deleteAlert } from "@/server/services/market";

export const DELETE = route(async (req, { params }) => {
  const u = await requireUser(req);
  await deleteAlert(u.id, (await params).id!);
  return json({ ok: true });
});
