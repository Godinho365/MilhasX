import { route, json, requireAdmin } from "@/server/http";
import { listUsers } from "@/server/services/admin";

export const GET = route(async (req) => {
  await requireAdmin(req);
  return json({ ok: true, items: await listUsers(new URL(req.url).searchParams.get("q") || undefined) });
});
