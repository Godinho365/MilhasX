import { route, json, requireUser, readBodyLimited } from "@/server/http";
import { DomainError } from "@/server/db";
import { getAvatar, setAvatar, removeAvatar } from "@/server/services/extras";

export const GET = route(async (req) => {
  const u = await requireUser(req);
  const a = await getAvatar(u.id);
  if (!a) throw new DomainError(404, "Sem foto");
  return new Response(new Uint8Array(a.data), { headers: { "content-type": a.mime, "cache-control": "private, max-age=300", "content-security-policy": "default-src 'none'" } });
});

// Corpo da requisição = bytes da imagem (até 512 KB). O tipo é validado pelo conteúdo.
export const PUT = route(async (req) => {
  const u = await requireUser(req);
  const buf = await readBodyLimited(req, 512 * 1024, "Imagem maior que 512 KB");
  await setAvatar(u.id, buf);
  return json({ ok: true });
});

export const DELETE = route(async (req) => {
  const u = await requireUser(req);
  await removeAvatar(u.id);
  return json({ ok: true });
});
