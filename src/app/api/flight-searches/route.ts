import { route, json, parseBody, requireUser } from "@/server/http";
import { flightSearchSchema } from "@/server/schemas";
import { logSearch, listSearches, clearSearches } from "@/server/services/flight-quotes";

export const GET = route(async (req) => {
  const u = await requireUser(req);
  return json({ ok: true, items: await listSearches(u.id) });
});

export const POST = route(async (req) => {
  const u = await requireUser(req);
  const b = await parseBody(req, flightSearchSchema);
  await logSearch(u.id, { ...b.params, returnDate: b.params.returnDate ?? null }, b.programs);
  return json({ ok: true }, 201);
});

export const DELETE = route(async (req) => {
  const u = await requireUser(req);
  await clearSearches(u.id);
  return json({ ok: true });
});
