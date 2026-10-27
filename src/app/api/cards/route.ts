import { route, json, parseBody, requireUser } from "@/server/http";
import { cardSchema } from "@/server/schemas";
import { cardsOverview, createCard } from "@/server/services/extras";

export const GET = route(async (req) => {
  const u = await requireUser(req);
  return json({ ok: true, ...(await cardsOverview(u.id)) });
});
export const POST = route(async (req) => {
  const u = await requireUser(req);
  return json({ ok: true, item: await createCard(u.id, await parseBody(req, cardSchema)) }, 201);
});
