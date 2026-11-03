import { route, json, requireUser, readBodyLimited } from "@/server/http";
import { DomainError } from "@/server/db";
import { ownShowcaseImage, removeShowcaseImage, setShowcaseImage } from "@/server/services/showcase";

export const GET = route(async (req, { params }) => {
  const u = await requireUser(req);
  const img = await ownShowcaseImage(u.id, (await params).id!);
  if (!img) throw new DomainError(404, "Sem foto");
  return new Response(new Uint8Array(img.data), { headers: { "content-type": img.mime, "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff" } });
});
// Corpo = bytes da imagem
export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  await setShowcaseImage(u.id, (await params).id!, await readBodyLimited(req, 2 * 1024 * 1024, "Imagem maior que 2 MB"));
  return json({ ok: true });
});
export const DELETE = route(async (req, { params }) => {
  const u = await requireUser(req);
  await removeShowcaseImage(u.id, (await params).id!);
  return json({ ok: true });
});
