import { route, json, parseBody, requireUser } from "@/server/http";
import { leadStatusSchema } from "@/server/schemas";
import { setLeadStatus, deleteLead } from "@/server/services/leads";

export const PATCH = route(async (req, { params }) => {
  const u = await requireUser(req);
  const { status } = await parseBody(req, leadStatusSchema);
  await setLeadStatus(u.id, (await params).id!, status);
  return json({ ok: true });
});

export const DELETE = route(async (req, { params }) => {
  const u = await requireUser(req);
  await deleteLead(u.id, (await params).id!);
  return json({ ok: true });
});
