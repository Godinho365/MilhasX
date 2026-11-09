import { route, json, parseBody, requireUser } from "@/server/http";
import { telegramOfferDmSchema } from "@/server/schemas";
import { sendOfferDm } from "@/server/services/telegram";

// Contraproposta no privado de quem postou o pedido: encaminha o pedido e manda a contraproposta como resposta a ele
export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, telegramOfferDmSchema);
  return json({ ok: true, item: await sendOfferDm(u.id, (await params).id!, b.messageId, b.text, b.adText) }, 201);
});
