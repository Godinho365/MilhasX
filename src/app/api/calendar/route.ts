import { route, json, requireUser } from "@/server/http";
import { calendarEvents } from "@/server/services/calendar";

/** Eventos do período (?from=AAAA-MM-DD&to=AAAA-MM-DD&membro=), conforme a função de quem pede. */
export const GET = route(async (req) => {
  const u = await requireUser(req);
  const sp = new URL(req.url).searchParams;
  const events = await calendarEvents(u.id, { from: sp.get("from") ?? "", to: sp.get("to") ?? "" }, { perms: u.actor.permissions }, { memberId: sp.get("membro") || null });
  return json({ events });
});
