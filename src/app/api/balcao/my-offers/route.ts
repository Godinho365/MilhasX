import { z } from "zod";
import { route, json, requireUser, parseBody } from "@/server/http";
import { BALCAO_PROGRAMS, balcaoCreateOffer, balcaoMyOffers } from "@/server/services/balcao";

// Balcão MilhasX, quem compra: minhas ofertas (?todas=1 inclui as encerradas) e abrir oferta (sai no canal do Balcão
// e alerta os milheiros, como pelo bot). As faixas são as do bot; ele confere de novo.
export const GET = route(async (req) => {
  const u = await requireUser(req);
  const all = new URL(req.url).searchParams.get("todas") === "1";
  return json({ ok: true, items: await balcaoMyOffers(u.id, all) });
});

const Body = z.object({
  programa: z.string().refine((p) => p in BALCAO_PROGRAMS, "Escolha o programa"),
  milhas: z.number().int("Milhas sem casas decimais").min(1_000, "Mínimo de 1.000 milhas").max(5_000_000, "Máximo de 5.000.000 milhas"),
  cpfs: z.number().int().min(1, "Pelo menos 1 passageiro").max(20, "No máximo 20 passageiros"),
  milheiro_centavos: z.number().int("Valor em centavos").min(100, "Mínimo R$ 1,00 o milheiro").max(50_000, "Máximo R$ 500,00 o milheiro"),
  urgente: z.boolean(),
  intermediada: z.boolean(),
  observacao: z.string().trim().max(300, "Observação: até 300 caracteres").optional().nullable(),
});

export const POST = route(async (req) => {
  const u = await requireUser(req);
  const body = await parseBody(req, Body);
  return json({ ok: true, item: await balcaoCreateOffer(u.id, u.actor.id, body) }, 201);
});
