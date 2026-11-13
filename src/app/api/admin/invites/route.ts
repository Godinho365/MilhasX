import { route, json, parseBody, requireAdmin } from "@/server/http";
import { inviteSchema } from "@/server/promo-schemas";
import { saveInvite } from "@/server/services/promo";

export const POST = route(async (req) => {
  const admin = await requireAdmin(req);
  const b = await parseBody(req, inviteSchema);
  const c = await saveInvite(admin.id, null, b);
  return json({ ok: true, id: c.id }, 201);
});
