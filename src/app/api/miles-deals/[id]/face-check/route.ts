import { z } from "zod";
import { route, json, parseBody, requireUser } from "@/server/http";
import { setFaceCheck } from "@/server/services/miles-deals";

/** Verificação antes da emissão: link da validação facial (convertido para o formato novo) e andamento. */
export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, z.object({ link: z.string().max(500).nullable().optional(), status: z.enum(["PENDING", "DONE", "NOT_NEEDED"]).nullable() }));
  return json({ ok: true, item: await setFaceCheck(u.id, (await params).id!, b) });
});
