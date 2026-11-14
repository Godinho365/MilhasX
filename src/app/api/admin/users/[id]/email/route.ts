import { z } from "zod";
import { route, json, parseBody, requireAdmin } from "@/server/http";
import { sendAccountFollowUp } from "@/server/services/admin-email";
import { EMAIL_REASONS } from "@/domain/admin-contact";

const schema = z.object({ reason: z.enum(EMAIL_REASONS) });

/** Recuperação, Leads e ficha do usuário: o MilhasX manda a mensagem pronta do motivo (uma vez a cada 24 h). */
export const POST = route(async (req, { params }) => {
  const admin = await requireAdmin(req);
  const b = await parseBody(req, schema);
  const r = await sendAccountFollowUp(admin.id, (await params).id!, b.reason);
  return json({ ok: true, sentAt: r.sentAt });
});
