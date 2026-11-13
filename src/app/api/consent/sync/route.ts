import { route, json, readCookie } from "@/server/http";
import { getUserByToken, SESSION_COOKIE } from "@/server/auth";
import { CONSENT_COOKIE, consentCookieHeader, decodeConsent } from "@/domain/consent";
import { syncConsent } from "@/server/services/privacy";

// Para quem está logado: junta a escolha deste navegador com a guardada na conta (vale a mais recente). Assim a
// escolha feita em um aparelho chega aos outros, e a feita antes do login passa a valer na conta.
export const POST = route(async (req) => {
  const person = await getUserByToken(readCookie(req, SESSION_COOKIE));
  const { consent, writeCookie } = await syncConsent(person?.id ?? null, decodeConsent(readCookie(req, CONSENT_COOKIE)));
  const headers: HeadersInit = writeCookie ? { "set-cookie": consentCookieHeader(consent, process.env.NODE_ENV === "production") } : {};
  return json({ ok: true, consent }, 200, headers);
});
