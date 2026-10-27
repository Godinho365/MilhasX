import { route, json, requireUser } from "@/server/http";
import { markNewsRead } from "@/server/services/extras";

export const POST = route(async (req) => {
  const u = await requireUser(req);
  await markNewsRead(u.id);
  return json({ ok: true });
});
