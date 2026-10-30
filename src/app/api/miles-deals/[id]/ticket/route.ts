import { route, json, requireUser, readBodyLimited } from "@/server/http";
import { DomainError } from "@/server/db";
import { addDealTicket, deleteDealTicket, getDealTicket, TICKET_MAX } from "@/server/services/miles-deals";

const download = (t: { name: string; mime: string; data: Buffer }) =>
  new Response(new Uint8Array(t.data), {
    headers: {
      "content-type": t.mime,
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(t.name)}`,
      "content-security-policy": "default-src 'none'",
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
    },
  });

export const GET = route(async (req, { params }) => {
  const u = await requireUser(req);
  return download(await getDealTicket(u.id, (await params).id!));
});

// Corpo = bytes do arquivo; nome no cabeçalho x-file-name (codificado em URI)
export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  if (Number(req.headers.get("content-length") || 0) > TICKET_MAX) throw new DomainError(413, "Arquivo maior que 10 MB");
  let name = "bilhete";
  try {
    name = decodeURIComponent(req.headers.get("x-file-name") || "bilhete");
  } catch {}
  return json({ ok: true, item: await addDealTicket(u.id, (await params).id!, name, await readBodyLimited(req, TICKET_MAX, "Arquivo maior que 10 MB")) }, 201);
});

export const DELETE = route(async (req, { params }) => {
  const u = await requireUser(req);
  return json({ ok: true, item: await deleteDealTicket(u.id, (await params).id!) });
});
