import { route, json, parseBody, requireUser } from "@/server/http";
import { processGenerateSchema } from "@/server/schemas";
import { generateFlow } from "@/server/services/process-ai";

/** Gera o rascunho de um fluxograma a partir da descrição (não salva: a pessoa revisa e salva). */
export const POST = route(async (req) => {
  const u = await requireUser(req);
  const b = await parseBody(req, processGenerateSchema);
  return json({ ok: true, draft: await generateFlow(u.id, b.description) });
});
