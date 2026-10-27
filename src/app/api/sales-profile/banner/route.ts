import { route, json, requireUser } from "@/server/http";
import { DomainError } from "@/server/db";
import { setBanner, removeBanner } from "@/server/services/settings";

// Corpo da requisição = bytes da imagem (até 1 MB). O tipo é validado pelo conteúdo.
export const PUT = route(async (req) => {
  const u = await requireUser(req);
  if (Number(req.headers.get("content-length") || 0) > 1024 * 1024) throw new DomainError(413, "Imagem maior que 1 MB");
  await setBanner(u.id, Buffer.from(await req.arrayBuffer()));
  return json({ ok: true });
});

export const DELETE = route(async (req) => {
  const u = await requireUser(req);
  await removeBanner(u.id);
  return json({ ok: true });
});
