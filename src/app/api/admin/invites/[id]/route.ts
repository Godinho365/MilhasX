import { route, json, parseBody, requireAdmin } from "@/server/http";
import { activeSchema, inviteSchema } from "@/server/promo-schemas";
import { saveInvite, setInviteActive } from "@/server/services/promo";

export const PUT = route(async (req, { params }) => {
  const admin = await requireAdmin(req);
  await saveInvite(admin.id, (await params).id!, await parseBody(req, inviteSchema));
  return json({ ok: true });
});

// Liga ou pausa o convite (não apaga: o histórico de quem usou fica)
export const PATCH = route(async (req, { params }) => {
  const admin = await requireAdmin(req);
  const { active } = await parseBody(req, activeSchema);
  await setInviteActive(admin.id, (await params).id!, active);
  return json({ ok: true });
});
