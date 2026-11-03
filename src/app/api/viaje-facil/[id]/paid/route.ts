import { route, json, parseBody, requireUser } from "@/server/http";
import { viajeFacilPaidSchema } from "@/server/schemas";
import { setViajeFacilPaid } from "@/server/services/miles";

export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, viajeFacilPaidSchema);
  return json({ ok: true, item: await setViajeFacilPaid(u.id, (await params).id!, b.paid) });
});
