import { route, json, requireUser } from "@/server/http";
import { commissionsOverview } from "@/server/services/commissions";

export const GET = route(async (req) => {
  const u = await requireUser(req);
  return json(await commissionsOverview(u.id));
});
