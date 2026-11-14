import { z } from "zod";
import { route, json, parseBody, requireAdmin } from "@/server/http";
import { sendSignupRecovery } from "@/server/services/admin-email";

// O lead vem pelo id do código de cadastro (o e-mail da pessoa não passa pela URL nem pelo corpo)
const schema = z.object({ codeId: z.string().trim().min(1).max(40) });

/** Leads › "Sem conta": o MilhasX manda o e-mail com o link para concluir o cadastro (uma vez a cada 24 h). */
export const POST = route(async (req) => {
  const admin = await requireAdmin(req);
  const b = await parseBody(req, schema);
  const r = await sendSignupRecovery(admin.id, b.codeId);
  return json({ ok: true, sentAt: r.sentAt });
});
