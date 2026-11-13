import { z } from "zod";
import { route, json, requireUser, parseBody } from "@/server/http";
import { DomainError } from "@/server/db";
import { proposeBalcao } from "@/server/services/balcao";

// Balcão MilhasX: manda (ou atualiza) a proposta na oferta; cria a negociação no CRM Milhas. Repetir o mesmo valor
// não avisa o comprador de novo.
const Body = z.object({
  cpmCents: z.number().int("Valor em centavos").min(100, "Mínimo R$ 1,00 o milheiro").max(50_000, "Máximo R$ 500,00 o milheiro"),
});

export const PUT = route(async (req, { params }) => {
  const u = await requireUser(req);
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) throw new DomainError(404, "Oferta não encontrada");
  const { cpmCents } = await parseBody(req, Body);
  return json({ ok: true, item: await proposeBalcao(u.id, id, cpmCents) });
});
