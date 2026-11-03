import { route, json, requireUser } from "@/server/http";
import { DomainError } from "@/server/db";
import { suggestFromOrder } from "@/server/services/showcase";

export const GET = route(async (req) => {
  const u = await requireUser(req);
  const order = new URL(req.url).searchParams.get("pedido");
  if (!order) throw new DomainError(400, "Escolha a cotação");
  return json({ ok: true, item: await suggestFromOrder(u.id, order) });
});
