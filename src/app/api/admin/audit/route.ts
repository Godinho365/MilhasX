import { route, json, requireAdmin } from "@/server/http";
import { listAudit } from "@/server/services/admin";

export const GET = route(async (req) => {
  await requireAdmin(req);
  const sp = new URL(req.url).searchParams;
  return json({ ok: true, ...(await listAudit({ action: sp.get("action") || undefined, page: Number(sp.get("page")) || 1 })) });
});
