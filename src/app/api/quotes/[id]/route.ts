import { route, json, requireUser } from "@/server/http";
import { deleteQuote } from "@/server/services/flight-quotes";

export const DELETE = route(async (req, { params }) => {
  const u = await requireUser(req);
  await deleteQuote(u.id, (await params).id!);
  return json({ ok: true });
});
