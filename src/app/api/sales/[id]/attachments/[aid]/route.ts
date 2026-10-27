import { route, json, requireUser } from "@/server/http";
import { getSaleAttachment, deleteSaleAttachment } from "@/server/services/sales";

export const GET = route(async (req, { params }) => {
  const u = await requireUser(req);
  const p = await params;
  const a = await getSaleAttachment(u.id, p.id!, p.aid!);
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
  await deleteSaleAttachment(u.id, p.id!, p.aid!);
  return json({ ok: true });
});
