import { route, json, parseBody, requireUser } from "@/server/http";
import { telegramCrmSchema } from "@/server/schemas";
import { registerAdInCrm } from "@/server/services/telegram";

// Registra o pedido do grupo no CRM Milhas (com o milheiro da sua contraproposta, se houver)
export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, telegramCrmSchema);
  return json({ ok: true, item: await registerAdInCrm(u.id, (await params).id!, b) }, 201);
});
