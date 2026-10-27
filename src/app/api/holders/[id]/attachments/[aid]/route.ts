import { route, json, requireUser } from "@/server/http";
import { getAttachment, deleteAttachment } from "@/server/services/holder-files";

// Download sempre como anexo, sem executar nada no navegador
export const GET = route(async (req, { params }) => {
  const u = await requireUser(req);
  const p = await params;
  const a = await getAttachment(u.id, p.id!, p.aid!);
  return new Response(new Uint8Array(a.data), {
    headers: {
      "content-type": a.mime,
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(a.name)}`,
      "content-security-policy": "default-src 'none'",
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
    },
  });
});

export const DELETE = route(async (req, { params }) => {
  const u = await requireUser(req);
  const p = await params;
  await deleteAttachment(u.id, p.id!, p.aid!);
  return json({ ok: true });
});
