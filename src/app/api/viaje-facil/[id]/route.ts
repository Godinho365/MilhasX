import { route, json, parseBody, requireUser } from "@/server/http";
import { viajeFacilSchema } from "@/server/schemas";
import { deleteViajeFacil, updateViajeFacil } from "@/server/services/miles";

export const PUT = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, viajeFacilSchema);
  return json({ ok: true, item: await updateViajeFacil(u.id, (await params).id!, b) });
});

export const DELETE = route(async (req, { params }) => {
  const u = await requireUser(req);
  await deleteViajeFacil(u.id, (await params).id!);
  return json({ ok: true });
});
