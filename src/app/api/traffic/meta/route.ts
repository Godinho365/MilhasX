import { route, json, requireUser } from "@/server/http";
import { disconnectMeta } from "@/server/services/traffic";

/** Desconecta o Meta: tira a permissão do app e apaga o token e as cópias dos relatórios. */
export const DELETE = route(async (req) => {
  const u = await requireUser(req);
  await disconnectMeta(u.id, u.actor.id);
  return json({ ok: true });
});
