import { route, json, parseBody, requireUser } from "@/server/http";
import { salesProfileSchema, salesPublicationSchema } from "@/server/schemas";
import { getSalesProfile, saveSalesProfile, setSalesProfilePublication } from "@/server/services/settings";

export const GET = route(async (req) => {
  const u = await requireUser(req);
  return json({ ok: true, item: await getSalesProfile(u.id) });
});

export const PUT = route(async (req) => {
  const u = await requireUser(req);
  const b = await parseBody(req, salesProfileSchema);
  return json({ ok: true, item: await saveSalesProfile(u.id, b) });
});

// Configurações › Sua MilhasX: ativar a página e escolher o endereço
export const PATCH = route(async (req) => {
  const u = await requireUser(req);
  const b = await parseBody(req, salesPublicationSchema);
  return json({ ok: true, item: await setSalesProfilePublication(u.id, u.name, b) });
});
