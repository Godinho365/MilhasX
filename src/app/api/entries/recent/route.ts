import { route, json, requireUser } from "@/server/http";
import { recentTemplates } from "@/server/services/ledger";

export const GET = route(async (req) => {
  const u = await requireUser(req);
  const direction = new URL(req.url).searchParams.get("direction") === "debit" ? "debit" : "credit";
  return json({ ok: true, items: await recentTemplates(u.id, direction) });
});
