import { route, json, parseBody, requireUser } from "@/server/http";
import { stageUpdateSchema } from "@/server/schemas";
import { deleteStage, updateStage } from "@/server/services/pipelines";

export const PUT = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, stageUpdateSchema);
  await updateStage(u.id, (await params).id!, b);
  return json({ ok: true });
});

/** ?moveTo=<coluna>: para onde vão os pedidos da coluna excluída. */
export const DELETE = route(async (req, { params }) => {
  const u = await requireUser(req);
  await deleteStage(u.id, (await params).id!, new URL(req.url).searchParams.get("moveTo") || undefined);
  return json({ ok: true });
});
