import { route, json, requireUser } from "@/server/http";
import { reportOverview } from "@/server/services/market";

export const GET = route(async (req) => {
  const u = await requireUser(req);
  const sp = new URL(req.url).searchParams;
  const months = Number(sp.get("months")) || 0;
  const from = months > 0 ? new Date(Date.now() - months * 30 * 86400_000) : undefined;
  return json({ ok: true, ...(await reportOverview(u.id, { from, programId: sp.get("programId") || undefined })) });
});
