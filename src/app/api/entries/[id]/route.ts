import { route, json, parseBody, requireUser } from "@/server/http";
import { entryPatchSchema } from "@/server/schemas";
import { updateEntry, deleteEntry, entryDetail } from "@/server/services/ledger";

export const GET = route(async (req, { params }) => {
  const u = await requireUser(req);
  return json({ ok: true, ...(await entryDetail(u.id, (await params).id!)) });
});

export const PATCH = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, entryPatchSchema);
  return json({ ok: true, item: await updateEntry(u.id, (await params).id!, b) });
});
export const DELETE = route(async (req, { params }) => {
  const u = await requireUser(req);
  return json({ ok: true, ...(await deleteEntry(u.id, (await params).id!)) });
});
