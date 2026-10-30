import { route, json, parseBody, requireUser } from "@/server/http";
import { dealSchema } from "@/server/schemas";
import { createDeal, listDeals } from "@/server/services/miles-deals";

export const GET = route(async (req) => {
  const u = await requireUser(req);
  return json({ ok: true, items: await listDeals(u.id) });
});

export const POST = route(async (req) => {
  const u = await requireUser(req);
  const b = await parseBody(req, dealSchema);
  return json({ ok: true, item: await createDeal(u.id, b) }, 201);
});
