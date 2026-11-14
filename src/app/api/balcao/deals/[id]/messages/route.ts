import { z } from "zod";
import { route, json, requireUser, parseBody } from "@/server/http";
import { balcaoSendMessage } from "@/server/services/balcao";
import { dealId } from "../../ids";

// Balcão MilhasX: mensagem de texto na conversa da negociação (chega no Telegram da outra parte)
const Body = z.object({ text: z.string().trim().min(1, "Escreva a mensagem").max(4000, "Mensagem: até 4.000 caracteres") });

export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  const id = await dealId(params);
  const { text } = await parseBody(req, Body);
  return json({ ok: true, item: await balcaoSendMessage(u.id, id, text) }, 201);
});
