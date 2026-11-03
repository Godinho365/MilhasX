import { route, json, parseBody, requireUser } from "@/server/http";
import { showcaseSchema } from "@/server/schemas";
import { deleteShowcaseItem, saveShowcaseItem } from "@/server/services/showcase";

export const PUT = route(async (req, { params }) => {
  const u = await requireUser(req);
  await saveShowcaseItem(u.id, (await params).id!, await parseBody(req, showcaseSchema));
  return json({ ok: true });
});
export const DELETE = route(async (req, { params }) => {
  const u = await requireUser(req);
  await deleteShowcaseItem(u.id, (await params).id!);
  return json({ ok: true });
});
