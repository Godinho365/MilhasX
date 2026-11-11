import { route, requireUser } from "@/server/http";
import { DomainError } from "@/server/db";
import { telegramDmMedia } from "@/server/services/telegram";

// Baixa/mostra a foto ou o arquivo de uma mensagem da conversa no privado (imagem abre na tela; o resto baixa).
export const GET = route(async (req, { params }) => {
  const u = await requireUser(req);
  const p = await params;
  const id = Number(p.msgId);
  if (!Number.isInteger(id)) throw new DomainError(400, "Mensagem inválida");
  const f = await telegramDmMedia(u.id, p.id!, id);
  if (!f) throw new DomainError(404, "Essa mensagem não tem anexo");
  const inline = f.mime.startsWith("image/") && f.mime !== "image/svg+xml";
  return new Response(new Uint8Array(f.bytes), {
    headers: {
      "content-type": f.mime,
      "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      "content-security-policy": "default-src 'none'",
      "x-content-type-options": "nosniff",
      "cache-control": "private, max-age=86400",
    },
  });
});
