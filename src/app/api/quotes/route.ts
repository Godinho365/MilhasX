import { route, json, parseBody, requireUser } from "@/server/http";
import { quoteSchema } from "@/server/schemas";
import { addQuote, listQuotes } from "@/server/services/flight-quotes";

export const GET = route(async (req) => {
  const u = await requireUser(req);
  const sp = new URL(req.url).searchParams;
  return json({ ok: true, items: await listQuotes(u.id, { orderId: sp.get("orderId") || undefined, origin: sp.get("origin")?.toUpperCase() || undefined, destination: sp.get("destination")?.toUpperCase() || undefined }) });
});

export const POST = route(async (req) => {
  const u = await requireUser(req);
  const b = await parseBody(req, quoteSchema);
  return json({ ok: true, item: await addQuote(u.id, b) }, 201);
});
