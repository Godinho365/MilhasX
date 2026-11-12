import { route, json, parseBody, requireUser } from "@/server/http";
import { commissionRuleSchema } from "@/server/schemas";
import { deleteRule, saveRule } from "@/server/services/commissions";

export const PUT = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, commissionRuleSchema);
  await saveRule(u.id, (await params).id!, b);
  return json({ ok: true });
});

export const DELETE = route(async (req, { params }) => {
  const u = await requireUser(req);
  await deleteRule(u.id, (await params).id!);
  return json({ ok: true });
});
