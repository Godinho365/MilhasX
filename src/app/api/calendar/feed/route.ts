import { route, json, requireUser } from "@/server/http";
import { createFeed, deleteFeed, feedStatus } from "@/server/services/calendar";

/** Link do calendário para o Google Agenda (só o dono da conta). */
export const GET = route(async (req) => {
  const u = await requireUser(req);
  return json(await feedStatus(u.id));
});

/** Gera um link novo (o anterior para de funcionar). O endereço só aparece nesta resposta. */
export const POST = route(async (req) => {
  const u = await requireUser(req);
  const token = await createFeed(u.id, u.actor.id);
  const origin = (process.env.APP_URL || new URL(req.url).origin).replace(/\/+$/, "");
  return json({ ok: true, url: `${origin}/api/calendar/feed/${token}.ics` }, 201);
});

export const DELETE = route(async (req) => {
  const u = await requireUser(req);
  await deleteFeed(u.id, u.actor.id);
  return json({ ok: true });
});
