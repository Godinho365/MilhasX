import { route, json, parseBody, requireUser } from "@/server/http";
import { transferSchema } from "@/server/schemas";
import { createTransfer } from "@/server/services/ledger";

export const POST = route(async (req) => {
  const u = await requireUser(req);
  const b = await parseBody(req, transferSchema);
  const r = await createTransfer(u.id, b);
  return json({ ok: true, ...r }, r.duplicated ? 200 : 201);
});
