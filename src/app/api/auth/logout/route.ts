import { route, json, readCookie, clearSessionCookie } from "@/server/http";
import { destroySession, SESSION_COOKIE } from "@/server/auth";

export const POST = route(async (req) => {
  await destroySession(readCookie(req, SESSION_COOKIE));
  return json({ ok: true }, 200, { "set-cookie": clearSessionCookie() });
});
