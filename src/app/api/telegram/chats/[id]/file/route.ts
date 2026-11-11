import { route, json, requireUser, readBodyLimited } from "@/server/http";
import { DomainError } from "@/server/db";
import { detectAttachment, MAX_BYTES } from "@/server/services/holder-files";
import { sendTelegramChatFile } from "@/server/services/telegram";

// Corpo = bytes do arquivo (foto, print ou PDF); nome no cabeçalho x-file-name. Manda no grupo.
export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  if (Number(req.headers.get("content-length") || 0) > MAX_BYTES) throw new DomainError(413, "Arquivo maior que 10 MB");
  const buf = await readBodyLimited(req, MAX_BYTES, "Arquivo maior que 10 MB");
  const mime = detectAttachment(buf);
  if (!mime) throw new DomainError(415, "Envie uma foto, print ou PDF (PNG, JPEG, WEBP, HEIC ou PDF)");
  let name = "arquivo";
  try {
    name = decodeURIComponent(req.headers.get("x-file-name") || "arquivo");
  } catch {}
  return json({ ok: true, item: await sendTelegramChatFile(u.id, (await params).id!, { name, mime, bytes: buf }) }, 201);
});
