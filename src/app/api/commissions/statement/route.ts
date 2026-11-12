import { route, json, requireUser } from "@/server/http";
import { DomainError } from "@/server/db";
import { statement } from "@/server/services/commissions";

/** Extrato de um membro (?member=) ou parceiro (?partner=). */
export const GET = route(async (req) => {
  const u = await requireUser(req);
  const sp = new URL(req.url).searchParams;
  const member = sp.get("member"), partner = sp.get("partner");
  if (!member === !partner) throw new DomainError(400, "Escolha um membro ou um parceiro");
  return json(await statement(u.id, member ? { memberId: member } : { partnerId: partner! }));
});
