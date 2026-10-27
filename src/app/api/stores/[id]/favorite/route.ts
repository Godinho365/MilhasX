import { route, json, requireUser } from "@/server/http";
import { toggleFavorite } from "@/server/services/market";

export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  return json({ ok: true, ...(await toggleFavorite(u.id, (await params).id!)) });
});
