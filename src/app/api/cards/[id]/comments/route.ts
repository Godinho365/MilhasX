import { route, json, parseBody, requireUser } from "@/server/http";
import { cardCommentSchema } from "@/server/schemas";
import { addCardComment } from "@/server/services/card-details";

export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, cardCommentSchema);
  await addCardComment(u.id, (await params).id!, b.text);
  return json({ ok: true }, 201);
});
