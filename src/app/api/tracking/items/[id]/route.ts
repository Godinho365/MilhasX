import { route, json, parseBody, requireUser } from "@/server/http";
import { trackingPatchSchema } from "@/server/schemas";
import { patchTracking } from "@/server/services/tracking";

/** Marca o check-in/confirmação do trecho e completa companhia e horários do item da venda. */
export const PATCH = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, trackingPatchSchema);
  return json({ ok: true, rows: await patchTracking(u.id, (await params).id!, b, u.actor.id) });
});
