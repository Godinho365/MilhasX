import { z } from "zod";
import { route, json, requireUser, parseBody } from "@/server/http";
import { balcaoHidden, balcaoSetHidden } from "@/server/services/balcao";

// Balcão MilhasX: limpar da lista as negociações e propostas encerradas (e trazer de volta). Só some do MilhasX.
export const GET = route(async (req) => {
  const u = await requireUser(req);
  return json({ ok: true, item: await balcaoHidden(u.id) });
});

const Body = z.object({
  tipo: z.enum(["negociacoes", "propostas"]),
  ids: z.array(z.number().int().positive()).min(1, "Nada para limpar").max(500, "No máximo 500 de cada vez"),
  ocultar: z.boolean(),
});

export const POST = route(async (req) => {
  const u = await requireUser(req);
  const body = await parseBody(req, Body);
  return json({ ok: true, item: await balcaoSetHidden(u.id, body.tipo, body.ids, body.ocultar) });
});
