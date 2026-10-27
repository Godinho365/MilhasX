import { route, json, parseBody } from "@/server/http";
import { resetSchema } from "@/server/schemas";
import { resetPassword } from "@/server/auth";

export const POST = route(async (req) => {
  const { token, password } = await parseBody(req, resetSchema);
  await resetPassword(token, password);
  return json({ ok: true });
});
