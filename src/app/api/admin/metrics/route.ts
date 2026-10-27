import { route, json, requireAdmin } from "@/server/http";
import { metrics } from "@/server/services/admin";

export const GET = route(async (req) => {
  await requireAdmin(req);
  return json({ ok: true, ...(await metrics()) });
});
