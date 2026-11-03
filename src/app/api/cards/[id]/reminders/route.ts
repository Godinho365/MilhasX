import { route, json, parseBody, requireUser } from "@/server/http";
import { cardReminderSchema } from "@/server/schemas";
import { addCardReminder } from "@/server/services/card-details";

export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, cardReminderSchema);
  return json({ ok: true, id: await addCardReminder(u.id, (await params).id!, b) }, 201);
});
