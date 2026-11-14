import { z } from "zod";
import { route, json, requireUser, parseBody } from "@/server/http";
import { DomainError } from "@/server/db";
import { balcaoChooseProposal } from "@/server/services/balcao";

// Balcão MilhasX, quem compra: escolhe a proposta. Com intermediação o PIX chega pelo bot; sem, o contato é liberado.
const Body = z.object({ proposalId: z.number().int().positive() });

export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) throw new DomainError(404, "Oferta não encontrada");
  const { proposalId } = await parseBody(req, Body);
  return json({ ok: true, item: await balcaoChooseProposal(u.id, u.actor.id, id, proposalId) });
});
