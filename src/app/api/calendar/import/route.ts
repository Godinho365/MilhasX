import { route, json, parseBody, requireUser } from "@/server/http";
import { calendarImportSchema } from "@/server/schemas";
import { importIcs } from "@/server/services/calendar";

/** Importa um .ics (o texto do arquivo) como eventos do tipo escolhido. */
export const POST = route(async (req) => {
  const u = await requireUser(req);
  const b = await parseBody(req, calendarImportSchema);
  return json({ ok: true, ...(await importIcs(u.id, b.ics, b.kind, u.actor.id)) });
});
