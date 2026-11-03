import { route, json, parseBody, requireUser } from "@/server/http";
import { saleTagsSchema } from "@/server/schemas";
import { setSaleTags } from "@/server/services/sales";

export const PUT = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, saleTagsSchema);
  return json({ ok: true, item: await setSaleTags(u.id, (await params).id!, b.tags) });
});
