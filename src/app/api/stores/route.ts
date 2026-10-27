import { route, json, requireUser } from "@/server/http";
import { listStores } from "@/server/services/market";

export const GET = route(async (req) => {
  const u = await requireUser(req);
  const sp = new URL(req.url).searchParams;
  const r = await listStores(u.id, { q: sp.get("q") || undefined, favorites: sp.get("favorites") === "1", page: Number(sp.get("page")) || 1 });
  return json({ ok: true, ...r });
});
