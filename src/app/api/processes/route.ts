import { route, json, parseBody, requireUser } from "@/server/http";
import { processSchema } from "@/server/schemas";
import { saveProcess } from "@/server/services/team";

export const POST = route(async (req) => {
  const u = await requireUser(req);
  const b = await parseBody(req, processSchema);
  return json({ ok: true, id: await saveProcess(u.id, null, b) }, 201);
});
