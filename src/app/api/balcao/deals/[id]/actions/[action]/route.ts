import { route, json, requireUser } from "@/server/http";
import { DomainError } from "@/server/db";
import { balcaoDealAction } from "@/server/services/balcao";
import type { BalcaoDealAction } from "@/server/balcao-api";
import { dealId } from "../../../ids";

// Balcão MilhasX: etapas da negociação — emitida (vendedor), concluida (comprador), cancelar (antes da emissão),
// cancelar-emissao (comprador, intermediada, até o prazo depois da emissão)
const ACTIONS: BalcaoDealAction[] = ["emitida", "concluida", "cancelar", "cancelar-emissao"];

export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  const id = await dealId(params);
  const action = (await params).action as BalcaoDealAction;
  if (!ACTIONS.includes(action)) throw new DomainError(404, "Ação não encontrada");
  return json({ ok: true, item: await balcaoDealAction(u.id, u.actor.id, id, action) });
});
