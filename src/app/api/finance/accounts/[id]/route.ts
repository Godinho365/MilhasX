import { route, json, parseBody, requireUser } from "@/server/http";
import { finAccountSchema } from "@/server/schemas";
import { deleteFinAccount, saveFinAccount } from "@/server/services/finance";

export const PUT = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, finAccountSchema);
  await saveFinAccount(u.id, (await params).id!, b);
  return json({ ok: true });
});

/** Conta com lançamentos é arquivada; vazia é excluída. */
export const DELETE = route(async (req, { params }) => {
  const u = await requireUser(req);
  return json({ ok: true, result: await deleteFinAccount(u.id, (await params).id!) });
});
