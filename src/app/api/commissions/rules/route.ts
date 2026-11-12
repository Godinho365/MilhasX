import { route, json, parseBody, requireUser } from "@/server/http";
import { commissionRuleSchema } from "@/server/schemas";
import { listRules, saveRule } from "@/server/services/commissions";

export const GET = route(async (req) => {
  const u = await requireUser(req);
  return json({ rules: await listRules(u.id) });
});

export const POST = route(async (req) => {
  const u = await requireUser(req);
  const b = await parseBody(req, commissionRuleSchema);
  return json({ ok: true, id: await saveRule(u.id, null, b) }, 201);
});
