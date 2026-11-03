import { route, json, requireUser } from "@/server/http";
import { importPassengersFromAccounts } from "@/server/services/contacts";

export const POST = route(async (req) => {
  const u = await requireUser(req);
  return json({ ok: true, created: await importPassengersFromAccounts(u.id) });
});
