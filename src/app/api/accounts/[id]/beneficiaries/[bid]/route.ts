import { route, json, requireUser } from "@/server/http";
import { removeBeneficiary } from "@/server/services/accounts";

export const DELETE = route(async (req, { params }) => {
  const u = await requireUser(req);
  const p = await params;
  await removeBeneficiary(u.id, p.id!, p.bid!);
  return json({ ok: true });
});
