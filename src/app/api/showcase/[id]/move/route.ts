import { route, json, parseBody, requireUser } from "@/server/http";
import { showcaseMoveSchema } from "@/server/schemas";
import { moveShowcaseItem } from "@/server/services/showcase";

export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  await moveShowcaseItem(u.id, (await params).id!, (await parseBody(req, showcaseMoveSchema)).dir);
  return json({ ok: true });
});
