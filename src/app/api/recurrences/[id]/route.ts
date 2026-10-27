import { route, json, parseBody, requireUser } from "@/server/http";
import { recurrenceSchema, recurrencePatchSchema } from "@/server/schemas";
import { upsertRecurrence, patchRecurrence, deleteRecurrence } from "@/server/services/accounts";

export const PUT = route(async (req, { params }) => {
  const u = await requireUser(req);
  return json({ ok: true, item: await upsertRecurrence(u.id, (await params).id!, await parseBody(req, recurrenceSchema)) });
});
export const PATCH = route(async (req, { params }) => {
  const u = await requireUser(req);
  return json({ ok: true, item: await patchRecurrence(u.id, (await params).id!, await parseBody(req, recurrencePatchSchema)) });
});
export const DELETE = route(async (req, { params }) => {
  const u = await requireUser(req);
  await deleteRecurrence(u.id, (await params).id!);
  return json({ ok: true });
});
