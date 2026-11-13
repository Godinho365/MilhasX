import { z } from "zod";
import { route, json, parseBody, requireUser } from "@/server/http";
import { redeemInvite } from "@/server/services/promo";
import { DomainError } from "@/server/db";

const schema = z.object({ code: z.string().trim().min(3).max(40) });

// Usa o convite (plano de cortesia ou dias de teste) na conta de quem entrou
export const POST = route(async (req) => {
  const u = await requireUser(req);
  // Login de equipe usa o plano do dono da conta: o convite tem de ser usado pelo dono
  if (u.workspaceOwnerId) throw new DomainError(403, "Peça ao dono da conta para usar o convite");
  const { code } = await parseBody(req, schema);
  return json({ ok: true, ...(await redeemInvite(u.id, code)) });
});
