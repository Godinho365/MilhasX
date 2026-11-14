import { route, requireUser } from "@/server/http";
import { balcaoDealFileFor } from "@/server/services/balcao";
import { dealId } from "../../../../ids";

// Balcão MilhasX: o arquivo de uma mensagem da conversa (abre no navegador; PDF e imagem)
export const GET = route(async (req, { params }) => {
  const u = await requireUser(req);
  const f = await balcaoDealFileFor(u.id, await dealId(params), await dealId(params, "mid"));
  const safe = ["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(f.mime) ? f.mime : "application/octet-stream";
  return new Response(f.data, {
    headers: {
      "content-type": safe,
      "content-disposition": `${safe === "application/octet-stream" ? "attachment" : "inline"}; filename="${encodeURIComponent(f.name)}"`,
      "x-content-type-options": "nosniff",
      "cache-control": "private, max-age=3600",
    },
  });
});
