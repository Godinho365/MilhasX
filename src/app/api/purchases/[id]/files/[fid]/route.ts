import { route, requireUser } from "@/server/http";
import { getPurchaseFile } from "@/server/services/accounts";

export const GET = route(async (req, { params }) => {
  const u = await requireUser(req);
  const p = await params;
  const a = await getPurchaseFile(u.id, p.id!, p.fid!);
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
