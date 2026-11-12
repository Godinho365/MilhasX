import { route, json, parseBody, requireUser } from "@/server/http";
import { trafficAccountsSchema } from "@/server/schemas";
import { selectAccounts } from "@/server/services/traffic";

/** Quais contas de anúncios aparecem no painel (até 3). */
export const PATCH = route(async (req) => {
  const u = await requireUser(req);
  const b = await parseBody(req, trafficAccountsSchema);
  return json({ ok: true, selected: await selectAccounts(u.id, b.selected) });
});
