import { z } from "zod";
import { route, json, parseBody, requireUser } from "@/server/http";
import { archiveDeal } from "@/server/services/miles-deals";

/** Arquiva ({ archived: true }) ou reabre ({ archived: false }) a negociação. */
export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, z.object({ archived: z.boolean() }));
  return json({ ok: true, item: await archiveDeal(u.id, (await params).id!, b.archived) });
});
