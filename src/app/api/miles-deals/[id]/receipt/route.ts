import { route, json, requireUser, readBodyLimited } from "@/server/http";
import { DomainError } from "@/server/db";
import { addDealReceipt, deleteDealReceipt, getDealReceipt, TICKET_MAX } from "@/server/services/miles-deals";

export const GET = route(async (req, { params }) => {
  const u = await requireUser(req);
  const r = await getDealReceipt(u.id, (await params).id!);
  return new Response(new Uint8Array(r.data), {
    headers: {
      "content-type": r.mime,
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(r.name)}`,
      "content-security-policy": "default-src 'none'",
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
    },
  });
});

// Corpo = bytes do arquivo; nome no cabeçalho x-file-name (codificado em URI). Com o comprovante a venda é lançada.
export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  if (Number(req.headers.get("content-length") || 0) > TICKET_MAX) throw new DomainError(413, "Arquivo maior que 10 MB");
  let name = "comprovante";
  try {
    name = decodeURIComponent(req.headers.get("x-file-name") || "comprovante");
  } catch {}
  const r = await addDealReceipt(u.id, (await params).id!, name, await readBodyLimited(req, TICKET_MAX, "Arquivo maior que 10 MB"));
  return json({ ok: true, ...r }, 201);
});

export const DELETE = route(async (req, { params }) => {
  const u = await requireUser(req);
  return json({ ok: true, item: await deleteDealReceipt(u.id, (await params).id!) });
});
