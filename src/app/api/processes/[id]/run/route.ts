import { route, json, parseBody, requireUser } from "@/server/http";
import { processRunSchema } from "@/server/schemas";
import { runProcess } from "@/server/services/team";

export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, processRunSchema);
  return json({ ok: true, created: await runProcess(u.id, (await params).id!, b) }, 201);
});
