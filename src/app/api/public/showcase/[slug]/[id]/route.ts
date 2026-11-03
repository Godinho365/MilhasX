import { route } from "@/server/http";
import { DomainError } from "@/server/db";
import { showcaseImage } from "@/server/services/showcase";

// Foto do card da vitrine pública (só com a vitrine ligada e o card ativo)
export const GET = route(async (_req, { params }) => {
  const p = await params;
  const img = await showcaseImage(p.slug!, p.id!);
  if (!img) throw new DomainError(404, "Foto não encontrada");
  return new Response(new Uint8Array(img.data), { headers: { "content-type": img.mime, "cache-control": "public, max-age=86400", "x-content-type-options": "nosniff" } });
});
