import { route, json, requireUser } from "@/server/http";
import { balcaoPixCheck } from "@/server/services/balcao";
import { dealId } from "../../ids";

// Balcão MilhasX: "Já paguei" do PIX da intermediação (consulta o pagamento; vencido gera outro)
export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  const id = await dealId(params);
  return json({ ok: true, item: await balcaoPixCheck(u.id, u.actor.id, id) });
});
