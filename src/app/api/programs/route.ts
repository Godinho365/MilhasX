import { route, json, requireUser } from "@/server/http";
import { listPrograms } from "@/server/services/admin";

export const GET = route(async (req) => {
  await requireUser(req);
  return json({ ok: true, items: await listPrograms(false) });
});
