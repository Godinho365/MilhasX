import { route, json, parseBody, requireUser } from "@/server/http";
import { holderDetailsSchema } from "@/server/schemas";
import { listHolders, saveHolder } from "@/server/services/wallet";

export const GET = route(async (req) => {
  const u = await requireUser(req);
  return json({ ok: true, items: await listHolders(u.id) });
});
export const POST = route(async (req) => {
  const u = await requireUser(req);
  const b = await parseBody(req, holderDetailsSchema);
  return json({ ok: true, item: await saveHolder(u.id, null, b) }, 201);
});
