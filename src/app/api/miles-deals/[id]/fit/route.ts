import { route, json, requireUser } from "@/server/http";
import { dealAccountFit } from "@/server/services/capacity";

/** Contas em ordem de sugestão para emitir a negociação (milhas, CPFs novos e saldo que sobra). */
export const GET = route(async (req, { params }) => {
  const u = await requireUser(req);
  return json({ ok: true, ...(await dealAccountFit(u.id, (await params).id!)) });
});
