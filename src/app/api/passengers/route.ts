import { route, json, parseBody, requireUser } from "@/server/http";
import { passengerSchema } from "@/server/schemas";
import { listPassengers, savePassenger } from "@/server/services/contacts";

export const GET = route(async (req) => {
  const u = await requireUser(req);
  return json({ ok: true, ...(await listPassengers(u.id, { q: new URL(req.url).searchParams.get("q") || undefined })) });
});

export const POST = route(async (req) => {
  const u = await requireUser(req);
  const b = await parseBody(req, passengerSchema);
  return json({ ok: true, id: await savePassenger(u.id, null, b) }, 201);
});
