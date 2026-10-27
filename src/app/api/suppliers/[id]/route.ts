import { route, json, requireUser } from "@/server/http";
import { deleteSupplier } from "@/server/services/extras";

export const DELETE = route(async (req, { params }) => {
  const u = await requireUser(req);
  await deleteSupplier(u.id, (await params).id!);
  return json({ ok: true });
});
