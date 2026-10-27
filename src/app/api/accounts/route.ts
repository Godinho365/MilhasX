import { route, json, parseBody, requireUser } from "@/server/http";
import { accountSchema } from "@/server/schemas";
import { listAccounts, createAccount } from "@/server/services/wallet";

export const GET = route(async (req) => {
  const u = await requireUser(req);
  const holderId = new URL(req.url).searchParams.get("holderId") || undefined;
  return json({ ok: true, items: await listAccounts(u.id, holderId) });
});
export const POST = route(async (req) => {
  const u = await requireUser(req);
  const b = await parseBody(req, accountSchema);
  return json({ ok: true, item: await createAccount(u.id, b.holderId, b.programId) }, 201);
});
