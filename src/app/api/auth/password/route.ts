import { route, json, parseBody, requireUser } from "@/server/http";
import { changePasswordSchema } from "@/server/schemas";
import { changePassword } from "@/server/auth";

export const POST = route(async (req) => {
  const u = await requireUser(req);
  const { current, next } = await parseBody(req, changePasswordSchema);
  await changePassword(u.id, current, next);
  return json({ ok: true });
});
