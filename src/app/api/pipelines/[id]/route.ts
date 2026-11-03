import { route, json, parseBody, requireUser } from "@/server/http";
import { pipelineSchema } from "@/server/schemas";
import { deletePipeline, renamePipeline } from "@/server/services/pipelines";

export const PUT = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, pipelineSchema);
  await renamePipeline(u.id, (await params).id!, b.name);
  return json({ ok: true });
});

export const DELETE = route(async (req, { params }) => {
  const u = await requireUser(req);
  await deletePipeline(u.id, (await params).id!);
  return json({ ok: true });
});
