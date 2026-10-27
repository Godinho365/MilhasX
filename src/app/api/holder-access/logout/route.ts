import { route, readCookie } from "@/server/http";
import { endHolderSession, HOLDER_COOKIE } from "@/server/services/holder-access";

export const POST = route(async (req) => {
  await endHolderSession(readCookie(req, HOLDER_COOKIE) ?? undefined);
  return new Response(null, { status: 303, headers: { location: "/h", "set-cookie": `${HOLDER_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` } });
});
