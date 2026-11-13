import { clientIp } from "@/server/http";
import { verifyTurnstile } from "@/server/captcha";
import { DomainError } from "@/server/db";
import { pickUtm } from "@/domain/traffic";
import { googleAuthUrl, googleEnabled, newState, stateCookie } from "@/server/google-oauth";

/** Início do "Continuar com Google": guarda o state num cookie e manda para o Google. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") === "signup" ? "signup" : "signin";
  const back = mode === "signup" ? "/register" : "/login";
  const fail = (msg: string) => new Response(null, { status: 303, headers: { location: `${back}?erro=${encodeURIComponent(msg)}` } });
  if (!googleEnabled()) return fail("Entrar com Google não está configurado");
  if (mode === "signup") {
    if (url.searchParams.get("terms") !== "1") return fail("Aceite os Termos de Serviço e a Política de Privacidade");
    try {
      await verifyTurnstile(url.searchParams.get("cf"), clientIp(req));
    } catch (e) {
      return fail(e instanceof DomainError ? e.message : "Verificação de segurança falhou");
    }
  }
  const state = newState();
  const ref = url.searchParams.get("ref")?.trim().slice(0, 20) || undefined;
  const inv = url.searchParams.get("convite")?.trim().toUpperCase();
  const invite = inv && /^[A-Z0-9_-]{3,30}$/.test(inv) ? inv : undefined;
  // utm_* chegam só quando a pessoa aceitou cookies de marketing (o formulário só manda nesse caso)
  const utm = pickUtm(url.searchParams) ?? undefined;
  return new Response(null, {
    status: 303,
    headers: { location: googleAuthUrl(req, state), "set-cookie": stateCookie({ state, mode, ref, invite, utm }) },
  });
}
