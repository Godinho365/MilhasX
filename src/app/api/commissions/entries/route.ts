import { route, json, parseBody, requireUser } from "@/server/http";
import { commissionEntrySchema } from "@/server/schemas";
import { addEntry } from "@/server/services/commissions";

/** Bônus ou ajuste no extrato de um membro ou parceiro. */
export const POST = route(async (req) => {
  const u = await requireUser(req);
  const { memberId, partnerId, ...b } = await parseBody(req, commissionEntrySchema);
  const owner = memberId ? { memberId } : { partnerId: partnerId! };
  return json({ ok: true, id: await addEntry(u.id, { ...owner, ...b }, u.actor.id) }, 201);
});
