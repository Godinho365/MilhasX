import { route, json, requireUser } from "@/server/http";
import { cardDetail } from "@/server/services/card-details";

export const GET = route(async (req, { params }) => {
  const u = await requireUser(req);
  return json({ ok: true, ...(await cardDetail(u.id, (await params).id!)) });
});
