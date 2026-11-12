import { route, json, parseBody, requireUser } from "@/server/http";
import { processAskSchema } from "@/server/schemas";
import { askProcesses } from "@/server/services/process-ai";

/** Pergunte à IA: responde dúvidas da equipe lendo os processos da agência. */
export const POST = route(async (req) => {
  const u = await requireUser(req);
  const b = await parseBody(req, processAskSchema);
  return json({ ok: true, ...(await askProcesses(u.id, b.question, b.history)) });
});
