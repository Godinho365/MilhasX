import { route, json, parseBody, requireUser } from "@/server/http";
import { viajeFacilSchema } from "@/server/schemas";
import { createViajeFacil, listViajeFacil } from "@/server/services/miles";

export const GET = route(async (req) => {
  const u = await requireUser(req);
  return json({ ok: true, ...(await listViajeFacil(u.id)) });
});

export const POST = route(async (req) => {
  const u = await requireUser(req);
  const b = await parseBody(req, viajeFacilSchema);
  return json({ ok: true, item: await createViajeFacil(u.id, b) }, 201);
});
