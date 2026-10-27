import { route, json, parseBody, requireUser } from "@/server/http";
import { bulkDeleteSchema } from "@/server/schemas";
import { deleteEntries } from "@/server/services/ledger";

export const POST = route(async (req) => {
  const u = await requireUser(req);
  const { ids } = await parseBody(req, bulkDeleteSchema);
  return json({ ok: true, ...(await deleteEntries(u.id, ids)) });
});
