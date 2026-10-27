import { route, readCookie } from "@/server/http";
import { DomainError } from "@/server/db";
import { getUserByToken, SESSION_COOKIE } from "@/server/auth";
import { getBanner } from "@/server/services/settings";

export const GET = route(async (req, { params }) => {
  const viewer = await getUserByToken(readCookie(req, SESSION_COOKIE));
  const b = await getBanner((await params).slug!, viewer?.id ?? null);
  if (!b) throw new DomainError(404, "Sem banner");
  return new Response(new Uint8Array(b.data), { headers: { "content-type": b.mime, "cache-control": "private, max-age=300", "content-security-policy": "default-src 'none'", "x-content-type-options": "nosniff" } });
});
