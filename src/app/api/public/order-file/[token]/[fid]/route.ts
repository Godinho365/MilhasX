import { route } from "@/server/http";
import { publicOrderFile } from "@/server/services/client-pages";

// Documento do pedido que o dono marcou como "visível para o cliente" (página da reserva).
export const GET = route(async (_req, { params }) => {
  const p = await params;
  const f = await publicOrderFile(p.token!, p.fid!);
  return new Response(new Uint8Array(f.data), {
    headers: {
      "content-type": f.mime,
      "content-disposition": "attachment; filename*=UTF-8''" + encodeURIComponent(f.name),
      "content-security-policy": "default-src 'none'",
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
    },
  });
});
