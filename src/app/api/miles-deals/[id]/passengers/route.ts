import { route, json, parseBody, requireUser } from "@/server/http";
import { ownerPassengersSchema } from "@/server/schemas";
import { setDealPassengers } from "@/server/services/miles-deals";

/** Passageiros informados pelo usuário na negociação (substitui a lista). */
export const PUT = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, ownerPassengersSchema);
  return json({ ok: true, item: await setDealPassengers(u.id, (await params).id!, b.passengers) });
});
