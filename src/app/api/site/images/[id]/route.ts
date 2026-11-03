import { route, requireUser } from "@/server/http";
import { DomainError } from "@/server/db";
import { ownSiteImage } from "@/server/services/site";

export const GET = route(async (req, { params }) => {
  const u = await requireUser(req);
  const img = await ownSiteImage(u.id, (await params).id!);
  if (!img) throw new DomainError(404, "Foto não encontrada");
  return new Response(new Uint8Array(img.data), { headers: { "content-type": img.mime, "cache-control": "private, max-age=86400", "x-content-type-options": "nosniff" } });
});
