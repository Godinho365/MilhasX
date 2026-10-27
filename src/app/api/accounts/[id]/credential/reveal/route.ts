import { route, json, parseBody, requireUser, clientIp } from "@/server/http";
import { revealSchema } from "@/server/schemas";
import { revealCredential } from "@/server/services/accounts";

// Nunca cacheado: a resposta contém a senha em texto
export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  const { password } = await parseBody(req, revealSchema);
  const data = await revealCredential(u.id, (await params).id!, password, clientIp(req));
  return json({ ok: true, ...data }, 200, { "cache-control": "no-store" });
});
