import { route, json, requireUser } from "@/server/http";
import { listGuides } from "@/server/services/extras";

export const GET = route(async (req) => {
  await requireUser(req);
  return json({ ok: true, items: await listGuides() });
});
