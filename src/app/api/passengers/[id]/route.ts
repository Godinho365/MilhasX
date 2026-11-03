import { route, json, parseBody, requireUser } from "@/server/http";
import { passengerSchema } from "@/server/schemas";
import { deletePassenger, savePassenger } from "@/server/services/contacts";

export const PUT = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, passengerSchema);
  await savePassenger(u.id, (await params).id!, b);
  return json({ ok: true });
});

export const DELETE = route(async (req, { params }) => {
  const u = await requireUser(req);
  await deletePassenger(u.id, (await params).id!);
  return json({ ok: true });
});
