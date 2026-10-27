import { route, json, parseBody, sessionCookie, clientIp } from "@/server/http";
import { loginSchema } from "@/server/schemas";
import { login } from "@/server/auth";

export const POST = route(async (req) => {
  const body = await parseBody(req, loginSchema);
  const { user, token, expiresAt } = await login(body.email, body.password, clientIp(req));
  return json({ ok: true, user: { id: user.id, name: user.name, role: user.role } }, 200, { "set-cookie": sessionCookie(token, expiresAt) });
});
