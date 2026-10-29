import { route, json, parseBody, requireUser } from "@/server/http";
import { quoteEditSchema } from "@/server/schemas";
import { deleteQuote, updateQuote } from "@/server/services/flight-quotes";

export const PATCH = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, quoteEditSchema);
  return json({ ok: true, item: await updateQuote(u.id, (await params).id!, b) });
});

export const DELETE = route(async (req, { params }) => {
  const u = await requireUser(req);
  await deleteQuote(u.id, (await params).id!);
  return json({ ok: true });
});
