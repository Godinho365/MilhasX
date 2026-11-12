import { route, json, parseBody, requireUser } from "@/server/http";
import { calendarEventSchema } from "@/server/schemas";
import { deleteEvent, saveEvent } from "@/server/services/calendar";

export const PUT = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, calendarEventSchema);
  await saveEvent(u.id, (await params).id!, b, u.actor.id);
  return json({ ok: true });
});

export const DELETE = route(async (req, { params }) => {
  const u = await requireUser(req);
  await deleteEvent(u.id, (await params).id!);
  return json({ ok: true });
});
