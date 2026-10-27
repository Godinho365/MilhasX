import { route, json, parseBody, requireUser } from "@/server/http";
import { cardSchema } from "@/server/schemas";
import { deleteCard, updateCard } from "@/server/services/extras";

export const PUT = route(async (req, { params }) => {
  const u = await requireUser(req);
  return json({ ok: true, item: await updateCard(u.id, (await params).id!, await parseBody(req, cardSchema)) });
});

export const DELETE = route(async (req, { params }) => {
  const u = await requireUser(req);
  await deleteCard(u.id, (await params).id!);
  return json({ ok: true });
});
