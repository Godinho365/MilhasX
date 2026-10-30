import { route, json, requireUser } from "@/server/http";
import { dealShareToken } from "@/server/services/miles-deals";

export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  return json({ ok: true, ...(await dealShareToken(u.id, (await params).id!)) });
});
