import { route, json, requireUser, readBodyLimited } from "@/server/http";
import { DomainError } from "@/server/db";
import { listSaleAttachments, addSaleAttachment, SALE_MAX_TOTAL } from "@/server/services/sales";

export const GET = route(async (req, { params }) => {
  const u = await requireUser(req);
  return json({ ok: true, items: await listSaleAttachments(u.id, (await params).id!) });
});

// Corpo = bytes do arquivo; nome no cabeçalho x-file-name (codificado em URI)
export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  if (Number(req.headers.get("content-length") || 0) > SALE_MAX_TOTAL) throw new DomainError(413, "Arquivo maior que 10 MB");
  let name = "arquivo";
  try {
    name = decodeURIComponent(req.headers.get("x-file-name") || "arquivo");
  } catch {}
  return json({ ok: true, item: await addSaleAttachment(u.id, (await params).id!, name, await readBodyLimited(req, 10 * 1024 * 1024, "Arquivo maior que 10 MB")) }, 201);
});
