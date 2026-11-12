import { route, json, parseBody, requireUser } from "@/server/http";
import { calendarEventSchema } from "@/server/schemas";
import { saveEvent } from "@/server/services/calendar";

export const POST = route(async (req) => {
  const u = await requireUser(req);
  const b = await parseBody(req, calendarEventSchema);
  return json({ ok: true, id: await saveEvent(u.id, null, b, u.actor.id) }, 201);
});
