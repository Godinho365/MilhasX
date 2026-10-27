import { route, json, parseBody, requireUser } from "@/server/http";
import { recurrenceSchema } from "@/server/schemas";
import { upsertRecurrence } from "@/server/services/accounts";

export const POST = route(async (req) => {
  const u = await requireUser(req);
  return json({ ok: true, item: await upsertRecurrence(u.id, null, await parseBody(req, recurrenceSchema)) }, 201);
});
