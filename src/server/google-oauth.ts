import { randomBytes } from "node:crypto";
import type { GoogleProfile } from "./auth";

/** Login com Google (OAuth 2.0 / OpenID Connect, fluxo "authorization code"). */
export const GOOGLE_STATE_COOKIE = "mm_google";

export const googleEnabled = () => !!(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());

/** Endereço de retorno cadastrado no Google Cloud: <APP_URL>/api/auth/google/callback */
export function googleRedirectUri(req: Request) {
  const base = process.env.APP_URL ? new URL(process.env.APP_URL).origin : new URL(req.url).origin;
  return `${base}/api/auth/google/callback`;
}

export interface GoogleState {
  state: string;
  mode: "signin" | "signup";
  ref?: string;
  /** Convite com plano para usar depois de entrar (/presente/CODIGO) */
  invite?: string;
}

export const newState = () => randomBytes(24).toString("base64url");

export function googleAuthUrl(req: Request, state: string) {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!.trim(),
    redirect_uri: googleRedirectUri(req),
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  }).toString();
  return u.toString();
}

export function stateCookie(value: GoogleState | null) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  if (!value) return `${GOOGLE_STATE_COOKIE}=; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
  const v = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${GOOGLE_STATE_COOKIE}=${v}; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=600${secure}`;
}

export function parseState(raw: string | null): GoogleState | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (typeof v?.state !== "string" || (v.mode !== "signin" && v.mode !== "signup")) return null;
    return { state: v.state, mode: v.mode, ref: typeof v.ref === "string" ? v.ref.slice(0, 20) : undefined, invite: typeof v.invite === "string" && /^[A-Z0-9_-]{3,30}$/.test(v.invite) ? v.invite : undefined };
  } catch {
    return null;
  }
}

/** Troca o código pelo token e lê o perfil (e-mail, nome) da conta Google. */
export async function fetchGoogleProfile(req: Request, code: string): Promise<GoogleProfile> {
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!.trim(),
      client_secret: process.env.GOOGLE_CLIENT_SECRET!.trim(),
      redirect_uri: googleRedirectUri(req),
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const tok = (await tokenRes.json().catch(() => ({}))) as { access_token?: string; error?: string };
  if (!tokenRes.ok || !tok.access_token) throw new Error(`google token: ${tokenRes.status} ${tok.error ?? ""}`);
  const infoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${tok.access_token}` },
    signal: AbortSignal.timeout(10_000),
  });
  const info = (await infoRes.json().catch(() => ({}))) as { sub?: string; email?: string; email_verified?: boolean; name?: string };
  if (!infoRes.ok || !info.sub || !info.email) throw new Error(`google userinfo: ${infoRes.status}`);
  return { sub: info.sub, email: info.email, emailVerified: info.email_verified === true, name: info.name ?? "" };
}
