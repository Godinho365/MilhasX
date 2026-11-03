import { route, json, parseBody, requireUser } from "@/server/http";
import { salesPartnerSchema } from "@/server/schemas";
import { listPartners, savePartner } from "@/server/services/team";

export const GET = route(async (req) => {
  const u = await requireUser(req);
  return json({ ok: true, items: await listPartners(u.id) });
});

export const POST = route(async (req) => {
  const u = await requireUser(req);
  const b = await parseBody(req, salesPartnerSchema);
  return json({ ok: true, id: await savePartner(u.id, null, b) }, 201);
});
