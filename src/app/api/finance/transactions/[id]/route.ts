import { route, json, parseBody, requireUser } from "@/server/http";
import { finTxSchema } from "@/server/schemas";
import { deleteFinTx, updateFinTx } from "@/server/services/finance";

export const PUT = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, finTxSchema);
  await updateFinTx(u.id, (await params).id!, b);
  return json({ ok: true });
});

export const DELETE = route(async (req, { params }) => {
  const u = await requireUser(req);
  await deleteFinTx(u.id, (await params).id!);
  return json({ ok: true });
});
