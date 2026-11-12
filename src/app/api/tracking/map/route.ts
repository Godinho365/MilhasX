import { route, json, requireUser } from "@/server/http";
import { trackingMap } from "@/server/services/tracking";

/** Mapa de viagens: quem está viajando, embarca em até 48h ou volta hoje. */
export const GET = route(async (req) => {
  const u = await requireUser(req);
  return json({ ok: true, ...(await trackingMap(u.id)) });
});
