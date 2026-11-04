import { z } from "zod";
import { route, json, parseBody, requireUser } from "@/server/http";
import { holderChoiceCookie } from "@/server/services/holder-choice";

const schema = z.object({ value: z.string().max(64) });

/** Troca o titular do seletor global. Só grava o cookie: quem chama recarrega a tela (sem renderizar a página aqui). */
export const PUT = route(async (req) => {
  const u = await requireUser(req);
  const { value } = await parseBody(req, schema);
  return json({ ok: true }, 200, { "set-cookie": await holderChoiceCookie(u.id, value) });
});
