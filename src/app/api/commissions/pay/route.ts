import { route, json, parseBody, requireUser } from "@/server/http";
import { DomainError } from "@/server/db";
import { commissionPaySchema } from "@/server/schemas";
import { payCommission } from "@/server/services/commissions";
import { can } from "@/domain/permissions";

/** Pagamento de comissão; com uma conta, vira despesa no Financeiro (para isso a função precisa editar o Financeiro). */
export const POST = route(async (req) => {
  const u = await requireUser(req);
  const { memberId, partnerId, ...b } = await parseBody(req, commissionPaySchema);
  if (b.finAccountId && !can(u.actor.permissions, "financeiro", "edit")) {
    throw new DomainError(403, "Sua função não lança no Financeiro: registre o pagamento sem conta");
  }
  const owner = memberId ? { memberId } : { partnerId: partnerId! };
  return json({ ok: true, id: await payCommission(u.id, { ...owner, ...b }, u.actor.id) }, 201);
});
