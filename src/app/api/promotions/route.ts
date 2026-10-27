import { route, json, requireUser } from "@/server/http";
import { listPromotions } from "@/server/services/extras";

export const GET = route(async (req) => {
  await requireUser(req);
  const sp = new URL(req.url).searchParams;
  return json({ ok: true, items: await listPromotions({ history: sp.get("history") === "1", q: sp.get("q") || undefined }) });
});
