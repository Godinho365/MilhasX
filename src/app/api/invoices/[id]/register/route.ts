import { route, json, parseBody, requireUser } from "@/server/http";
import { registerPointsSchema } from "@/server/schemas";
import { registerInvoicePoints } from "@/server/services/extras";

// "Registrar pontos" da fatura: os pontos caíram na conta
export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, registerPointsSchema);
  return json({ ok: true, item: await registerInvoicePoints(u.id, (await params).id!, { points: b.points, date: new Date(b.date) }) });
});
