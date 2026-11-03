import { route, json, parseBody, requireUser } from "@/server/http";
import { interestSchema } from "@/server/schemas";
import { deleteInterest, saveInterest } from "@/server/services/contacts";

export const PUT = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, interestSchema);
  await saveInterest(u.id, (await params).id!, b);
  return json({ ok: true });
});

export const DELETE = route(async (req, { params }) => {
  const u = await requireUser(req);
  await deleteInterest(u.id, (await params).id!);
  return json({ ok: true });
});
