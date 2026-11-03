import { route, json, parseBody, requireUser } from "@/server/http";
import { pipelineSchema } from "@/server/schemas";
import { createPipeline, listPipelines } from "@/server/services/pipelines";

export const GET = route(async (req) => {
  const u = await requireUser(req);
  return json({ ok: true, items: await listPipelines(u.id) });
});

export const POST = route(async (req) => {
  const u = await requireUser(req);
  const b = await parseBody(req, pipelineSchema);
  return json({ ok: true, id: await createPipeline(u.id, b.name) }, 201);
});
