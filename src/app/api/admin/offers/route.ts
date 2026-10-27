import { route, json, parseBody, requireAdmin } from "@/server/http";
import { offerSchema } from "@/server/schemas";
import { upsertStoreOffer } from "@/server/services/admin";

export const POST = route(async (req) => {
  const admin = await requireAdmin(req);
  const b = await parseBody(req, offerSchema);
  return json({ ok: true, item: await upsertStoreOffer(admin.id, b) }, 201);
});
