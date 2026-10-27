import { route, json, parseBody, requireUser } from "@/server/http";
import { accountPatchSchema } from "@/server/schemas";
import { deleteAccount, updateAccount } from "@/server/services/wallet";

export const PATCH = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, accountPatchSchema);
  return json({ ok: true, item: await updateAccount(u.id, (await params).id!, b) });
});
export const DELETE = route(async (req, { params }) => {
  const u = await requireUser(req);
  await deleteAccount(u.id, (await params).id!);
  return json({ ok: true });
});
