import { z } from "zod";
import { route, json, requireUser, parseBody } from "@/server/http";
import { balcaoReportDeal } from "@/server/services/balcao";
import { dealId } from "../../ids";

// Balcão MilhasX: reclamação sobre a negociação (vai para a equipe do Balcão; na intermediação, segura o repasse)
const Body = z.object({ text: z.string().trim().min(10, "Conte o que aconteceu (pelo menos 10 caracteres)").max(1500) });

export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  const id = await dealId(params);
  const { text } = await parseBody(req, Body);
  return json({ ok: true, item: await balcaoReportDeal(u.id, u.actor.id, id, text) }, 201);
});
