import { route, requireUser } from "@/server/http";
import { DomainError } from "@/server/db";
import { getStoreLogo } from "@/server/services/store-import";

// Logo da loja (baixado da fonte). A URL leva ?v=<data da imagem>, então o navegador guarda por bastante tempo
export const GET = route(async (req, { params }) => {
  await requireUser(req);
  const logo = await getStoreLogo((await params).id!);
  if (!logo) throw new DomainError(404, "Sem imagem");
  return new Response(new Uint8Array(logo.data), {
    headers: { "content-type": logo.mime, "cache-control": "private, max-age=604800", "content-security-policy": "default-src 'none'", "x-content-type-options": "nosniff" },
  });
});
