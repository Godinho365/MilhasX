import { route, json, parseBody, requireAdmin } from "@/server/http";
import { programSchema } from "@/server/schemas";
import { upsertProgram } from "@/server/services/admin";

export const PATCH = route(async (req, { params }) => {
  const admin = await requireAdmin(req);
  const b = await parseBody(req, programSchema);
  return json({ ok: true, item: await upsertProgram(admin.id, (await params).id!, b) });
});
