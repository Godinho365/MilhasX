import { route, json, parseBody, requireAdmin } from "@/server/http";
import { DomainError } from "@/server/db";
import { partnerSchema, clubPlanSchema } from "@/server/schemas";
import { upsertPartner, upsertClubPlan, deletePartner, deleteClubPlan } from "@/server/services/calculators";

const kind = (t: string | undefined) => {
  if (t !== "partner" && t !== "club") throw new DomainError(404, "Não encontrado");
  return t;
};

export const PATCH = route(async (req, { params }) => {
  const admin = await requireAdmin(req);
  const p = await params;
  const item = kind(p.type) === "partner"
    ? await upsertPartner(admin.id, p.id!, await parseBody(req, partnerSchema))
    : await upsertClubPlan(admin.id, p.id!, await parseBody(req, clubPlanSchema));
  return json({ ok: true, item });
});
export const DELETE = route(async (req, { params }) => {
  const admin = await requireAdmin(req);
  const p = await params;
  await (kind(p.type) === "partner" ? deletePartner(admin.id, p.id!) : deleteClubPlan(admin.id, p.id!));
  return json({ ok: true });
});
