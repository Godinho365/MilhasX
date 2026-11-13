import { z } from "zod";
import { route, json, parseBody, requireAdmin } from "@/server/http";
import { extendTrial } from "@/server/services/admin";

const schema = z.object({ days: z.number().int().min(1).max(365) });

export const POST = route(async (req, { params }) => {
  const admin = await requireAdmin(req);
  const { days } = await parseBody(req, schema);
  const r = await extendTrial(admin.id, (await params).id!, days);
  return json({ ok: true, trialEndsAt: r.trialEndsAt.toISOString() });
});
