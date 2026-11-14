import { z } from "zod";
import { route, json, requireUser, parseBody } from "@/server/http";
import { balcaoRateDeal } from "@/server/services/balcao";
import { dealId } from "../../ids";

// Balcão MilhasX: avaliação da outra parte, depois de concluída (o comentário vai para revisão no Balcão)
const Body = z.object({
  stars: z.number().int().min(1, "De 1 a 5 estrelas").max(5, "De 1 a 5 estrelas"),
  comment: z.string().trim().max(300, "Comentário: até 300 caracteres").optional().nullable(),
});

export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  const id = await dealId(params);
  const { stars, comment } = await parseBody(req, Body);
  return json({ ok: true, item: await balcaoRateDeal(u.id, u.actor.id, id, stars, comment) });
});
