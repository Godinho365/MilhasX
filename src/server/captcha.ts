import { DomainError, log } from "./db";

/** Chave pública do Cloudflare Turnstile (vai para o navegador). Vazia = verificação desligada. */
export const turnstileSiteKey = () => process.env.TURNSTILE_SITE_KEY?.trim() || "";

/**
 * Confere o token do Cloudflare Turnstile no servidor. Sem TURNSTILE_SECRET_KEY configurada
 * a verificação fica desligada (desenvolvimento e testes).
 */
export async function verifyTurnstile(token: string | undefined | null, ip?: string) {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) return;
  if (!token) throw new DomainError(400, "Confirme que você não é um robô");
  let ok = false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip && ip !== "local") body.set("remoteip", ip);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body, signal: AbortSignal.timeout(8000) });
    const data = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
    ok = !!data.success;
    if (!ok) log("warn", "captcha.rejected", { codes: data["error-codes"] });
  } catch (e) {
    log("error", "captcha.unavailable", { err: String(e) });
    throw new DomainError(503, "Não foi possível validar a verificação de segurança. Tente novamente.");
  }
  if (!ok) throw new DomainError(400, "A verificação de segurança expirou. Tente novamente.");
}
