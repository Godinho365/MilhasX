import { route, json, parseBody, requireUser } from "@/server/http";
import { salePartnerSchema } from "@/server/schemas";
import { setSalePartner } from "@/server/services/sales";

export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, salePartnerSchema);
  return json({ ok: true, item: await setSalePartner(u.id, (await params).id!, b.partnerId) });
});
