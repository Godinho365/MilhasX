import { route, json, parseBody, requireUser } from "@/server/http";
import { transferSchema } from "@/server/schemas";
import { getTransfer, updateTransfer } from "@/server/services/ledger";

export const GET = route(async (req, { params }) => {
  const u = await requireUser(req);
  return json({ ok: true, item: await getTransfer(u.id, (await params).groupId!) });
});
export const PATCH = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, transferSchema);
  return json({ ok: true, ...(await updateTransfer(u.id, (await params).groupId!, b)) });
});
