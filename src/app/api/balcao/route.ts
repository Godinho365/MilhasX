import { z } from "zod";
import { route, json, requireUser, parseBody } from "@/server/http";
import { balcaoStatus, linkBalcao, unlinkBalcao } from "@/server/services/balcao";

// Balcão MilhasX: situação do vínculo (GET), vincular com o código do bot /milhasx (POST) e desvincular (DELETE)
export const GET = route(async (req) => {
  const u = await requireUser(req);
  return json({ ok: true, item: await balcaoStatus(u.id) });
});

const LinkBody = z.object({ code: z.string().trim().min(1, "Informe o código do bot").max(20) });

export const POST = route(async (req) => {
  const u = await requireUser(req);
  const { code } = await parseBody(req, LinkBody);
  return json({ ok: true, item: await linkBalcao(u.id, u.actor.id, code) }, 201);
});

export const DELETE = route(async (req) => {
  const u = await requireUser(req);
  return json({ ok: true, item: await unlinkBalcao(u.id, u.actor.id) });
});
