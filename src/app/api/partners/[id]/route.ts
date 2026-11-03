import { route, json, parseBody, requireUser } from "@/server/http";
import { salesPartnerSchema } from "@/server/schemas";
import { deletePartner, savePartner } from "@/server/services/team";

export const PUT = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, salesPartnerSchema);
  await savePartner(u.id, (await params).id!, b);
  return json({ ok: true });
});

export const DELETE = route(async (req, { params }) => {
  const u = await requireUser(req);
  await deletePartner(u.id, (await params).id!);
  return json({ ok: true });
});
