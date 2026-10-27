import { route, json, parseBody, requireAdmin } from "@/server/http";
import { programSchema } from "@/server/schemas";
import { listPrograms, upsertProgram } from "@/server/services/admin";

export const GET = route(async (req) => {
  await requireAdmin(req);
  return json({ ok: true, items: await listPrograms(true) });
});
export const POST = route(async (req) => {
  const admin = await requireAdmin(req);
  const b = await parseBody(req, programSchema);
  return json({ ok: true, item: await upsertProgram(admin.id, null, b) }, 201);
});
