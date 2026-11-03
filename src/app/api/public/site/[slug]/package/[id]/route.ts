import { route } from "@/server/http";
import { DomainError } from "@/server/db";
import { publicSitePackageImage } from "@/server/services/site";

// Foto de um pacote da Vitrine mostrado no site publicado
export const GET = route(async (_req, { params }) => {
  const p = await params;
  const img = await publicSitePackageImage(p.slug!, p.id!);
  if (!img) throw new DomainError(404, "Foto não encontrada");
  return new Response(new Uint8Array(img.data), { headers: { "content-type": img.mime, "cache-control": "public, max-age=86400", "x-content-type-options": "nosniff" } });
});
