import { route, json, requireActor } from "@/server/http";
import { DomainError } from "@/server/db";
import { sendPushToUser } from "@/server/push";

/** Manda um push de teste para os aparelhos da pessoa. */
export const POST = route(async (req) => {
  const u = await requireActor(req);
  const sent = await sendPushToUser(u.id, { title: "Notificações ativadas", body: "Tudo certo: os avisos do MilhasX vão chegar neste aparelho.", url: "/app/settings", tag: "teste" });
  if (!sent) throw new DomainError(404, "Nenhum aparelho com push ativado. Ative neste aparelho primeiro.");
  return json({ ok: true, sent });
});
