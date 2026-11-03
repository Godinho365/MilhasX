import { route, json, parseBody, requireUser } from "@/server/http";
import { stageCreateSchema } from "@/server/schemas";
import { addStage } from "@/server/services/pipelines";

export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, stageCreateSchema);
  return json({ ok: true, id: await addStage(u.id, (await params).id!, b) }, 201);
});
