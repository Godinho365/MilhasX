import { route, requireUser } from "@/server/http";
import { DomainError } from "@/server/db";
import { getProgramLogo } from "@/server/services/admin";

// A URL leva ?v=<data da imagem>, então o navegador pode guardar por bastante tempo
export const GET = route(async (req, { params }) => {
  await requireUser(req);
  const logo = await getProgramLogo((await params).id!);
  if (!logo) throw new DomainError(404, "Sem imagem");
  return new Response(new Uint8Array(logo.data), {
    headers: { "content-type": logo.mime, "cache-control": "private, max-age=604800", "content-security-policy": "default-src 'none'", "x-content-type-options": "nosniff" },
  });
});
