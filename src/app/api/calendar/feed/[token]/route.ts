import { route } from "@/server/http";
import { feedIcs } from "@/server/services/calendar";

/** O calendário em .ics pelo link secreto (o Google Agenda busca sozinho, sem login). */
export const GET = route(async (_req, { params }) => {
  const token = ((await params).token ?? "").replace(/\.ics$/i, "");
  const ics = await feedIcs(token);
  if (!ics) return new Response("Link inválido ou desligado", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  return new Response(ics, { headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "private, max-age=300" } });
});
