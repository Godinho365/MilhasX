import { z } from "zod";
import { route, json, parseBody, requireAdmin } from "@/server/http";
import { partnerSchema, clubPlanSchema } from "@/server/schemas";
import { upsertPartner, upsertClubPlan } from "@/server/services/calculators";

const body = z.discriminatedUnion("type", [partnerSchema.extend({ type: z.literal("partner") }), clubPlanSchema.extend({ type: z.literal("club") })]);

export const POST = route(async (req) => {
  const admin = await requireAdmin(req);
  const { type, ...b } = await parseBody(req, body);
  const item = type === "partner" ? await upsertPartner(admin.id, null, b as z.infer<typeof partnerSchema>) : await upsertClubPlan(admin.id, null, b as z.infer<typeof clubPlanSchema>);
  return json({ ok: true, item }, 201);
});
