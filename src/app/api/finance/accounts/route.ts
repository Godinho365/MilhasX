import { route, json, parseBody, requireUser } from "@/server/http";
import { finAccountSchema } from "@/server/schemas";
import { listFinAccounts, saveFinAccount } from "@/server/services/finance";

export const GET = route(async (req) => {
  const u = await requireUser(req);
  return json({ ok: true, items: await listFinAccounts(u.id) });
});

export const POST = route(async (req) => {
  const u = await requireUser(req);
  const b = await parseBody(req, finAccountSchema);
  return json({ ok: true, id: await saveFinAccount(u.id, null, b) }, 201);
});
