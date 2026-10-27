import { route, json, requireUser } from "@/server/http";
import { listLeads } from "@/server/services/leads";

export const GET = route(async (req) => {
  const u = await requireUser(req);
  return json({ ok: true, items: await listLeads(u.id) });
});
