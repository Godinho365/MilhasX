import { route, json, parseBody, requireUser } from "@/server/http";
import { batchSchema } from "@/server/schemas";
import { createEntriesBatch } from "@/server/services/ledger";

export const POST = route(async (req) => {
  const u = await requireUser(req);
  const b = await parseBody(req, batchSchema);
  const r = await createEntriesBatch(u.id, b.items, b.idempotencyKey);
  return json({ ok: true, ...r }, r.duplicated ? 200 : 201);
});
