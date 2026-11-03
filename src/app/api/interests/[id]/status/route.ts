import { route, json, parseBody, requireUser } from "@/server/http";
import { interestStatusSchema } from "@/server/schemas";
import { setInterestStatus } from "@/server/services/contacts";

export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, interestStatusSchema);
  await setInterestStatus(u.id, (await params).id!, b.status);
  return json({ ok: true });
});
