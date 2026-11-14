import { route, json, requireUser } from "@/server/http";
import { DomainError } from "@/server/db";
import { balcaoCancelOffer, balcaoMyOffer } from "@/server/services/balcao";

const offerId = async (params: Promise<Record<string, string>>) => {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) throw new DomainError(404, "Oferta não encontrada");
  return id;
};

// Balcão MilhasX, quem compra: a minha oferta com as propostas recebidas (GET) e cancelar a oferta aberta (DELETE)
export const GET = route(async (req, { params }) => {
  const u = await requireUser(req);
  return json({ ok: true, item: await balcaoMyOffer(u.id, await offerId(params)) });
});

export const DELETE = route(async (req, { params }) => {
  const u = await requireUser(req);
  return json({ ok: true, item: await balcaoCancelOffer(u.id, u.actor.id, await offerId(params)) });
});
