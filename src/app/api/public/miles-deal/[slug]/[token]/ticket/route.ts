import { route, json } from "@/server/http";
import { publicDealTicket } from "@/server/services/miles-deals";

// Página do comprador: baixar o bilhete da emissão
export const GET = route(async (_req, { params }) => {
  const { slug, token } = await params;
  const t = await publicDealTicket(slug!, token!);
  if (!t) return json({ ok: false, erro: "Bilhete não encontrado" }, 404);
  return new Response(new Uint8Array(t.data), {
    headers: {
      "content-type": t.mime,
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(t.name)}`,
      "content-security-policy": "default-src 'none'",
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex",
    },
  });
});
