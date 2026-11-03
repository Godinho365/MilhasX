import { route, json, parseBody, requireUser } from "@/server/http";
import { checkInSchema } from "@/server/schemas";
import { checkInKeyResult } from "@/server/services/team";

export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, checkInSchema);
  await checkInKeyResult(u.id, (await params).id!, b.current);
  return json({ ok: true });
});
