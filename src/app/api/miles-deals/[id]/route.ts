import { route, json, parseBody, requireUser } from "@/server/http";
import { dealSchema } from "@/server/schemas";
import { deleteDeal, updateDeal } from "@/server/services/miles-deals";

export const PUT = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, dealSchema);
  return json({ ok: true, item: await updateDeal(u.id, (await params).id!, b) });
});

export const DELETE = route(async (req, { params }) => {
  const u = await requireUser(req);
  await deleteDeal(u.id, (await params).id!);
  return json({ ok: true });
});
