import { readCookie, sessionCookie, clientIp } from "@/server/http";
import { loginWithGoogle } from "@/server/auth";
import { isRegistrationOpen } from "@/server/services/admin";
import { DomainError, log, prisma } from "@/server/db";
import { GOOGLE_STATE_COOKIE, fetchGoogleProfile, googleEnabled, parseState, stateCookie } from "@/server/google-oauth";

/** Retorno do Google: confere o state, lê o perfil, entra (ou cria a conta) e vai para o app. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const saved = parseState(readCookie(req, GOOGLE_STATE_COOKIE));
  const back = saved?.mode === "signup" ? "/register" : "/login";
  const headers = new Headers();
  headers.append("set-cookie", stateCookie(null));
  const go = (location: string) => {
    headers.set("location", location);
    return new Response(null, { status: 303, headers });
  };
  const fail = (msg: string) => go(`${back}?erro=${encodeURIComponent(msg)}`);

  if (!googleEnabled()) return fail("Entrar com Google não está configurado");
  if (url.searchParams.get("error")) return fail("Login com Google cancelado");
  const code = url.searchParams.get("code");
  if (!saved || !code || url.searchParams.get("state") !== saved.state) return fail("Sessão de login expirou. Tente novamente.");

  try {
    const profile = await fetchGoogleProfile(req, code);
    const { user, token, expiresAt } = await loginWithGoogle(profile, { ref: saved.ref, allowCreate: await isRegistrationOpen() });
    await prisma.loginAttempt.create({ data: { email: user.email, ip: clientIp(req), success: true } });
    headers.append("set-cookie", sessionCookie(token, expiresAt));
    return go(saved.invite ? `/convite/${encodeURIComponent(saved.invite)}` : "/app");
  } catch (e) {
    if (e instanceof DomainError) return fail(e.message);
    log("error", "auth.google.failed", { err: String(e) });
    return fail("Não foi possível entrar com Google. Tente novamente.");
  }
}
