import { createHmac, randomBytes } from "node:crypto";

// Meta (Facebook/Instagram) Marketing API, só leitura dos anúncios (permissão ads_read). Precisa do app de
// desenvolvedor do Meta: META_APP_ID e META_APP_SECRET; sem eles o Tráfego mostra o que falta configurar.
export const META_STATE_COOKIE = "mm_meta";
export const META_SCOPE = "ads_read";
export const metaEnabled = () => !!(process.env.META_APP_ID?.trim() && process.env.META_APP_SECRET?.trim());
/** Versão da API (a Marketing API sai de linha em cerca de um ano; dá para trocar pela variável). */
export const graphVersion = () => process.env.META_GRAPH_VERSION?.trim() || "v26.0";
const GRAPH = () => `https://graph.facebook.com/${graphVersion()}`;

/** Endereço de retorno cadastrado no app do Meta: <APP_URL>/api/traffic/meta/callback */
export function metaRedirectUri(req: Request) {
  const base = process.env.APP_URL ? new URL(process.env.APP_URL).origin : new URL(req.url).origin;
  return `${base}/api/traffic/meta/callback`;
}

export const newMetaState = () => randomBytes(24).toString("base64url");
export function metaAuthUrl(req: Request, state: string) {
  const u = new URL(`https://www.facebook.com/${graphVersion()}/dialog/oauth`);
  u.search = new URLSearchParams({ client_id: process.env.META_APP_ID!.trim(), redirect_uri: metaRedirectUri(req), state, scope: META_SCOPE, response_type: "code" }).toString();
  return u.toString();
}
/** Cookie do state (amarrado à conta que começou a conexão), só para as rotas do Meta, 10 minutos. */
export function metaStateCookie(value: { state: string; userId: string } | null) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  if (!value) return `${META_STATE_COOKIE}=; Path=/api/traffic/meta; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
  return `${META_STATE_COOKIE}=${Buffer.from(JSON.stringify(value)).toString("base64url")}; Path=/api/traffic/meta; HttpOnly; SameSite=Lax; Max-Age=600${secure}`;
}
export function parseMetaState(raw: string | null): { state: string; userId: string } | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    return typeof v?.state === "string" && typeof v?.userId === "string" ? { state: v.state, userId: v.userId } : null;
  } catch {
    return null;
  }
}

/** Erro devolvido pelo Meta (code 190 = token vencido ou permissão tirada; 4, 17, 32, 613, 80000+ = limite de chamadas). */
export class MetaError extends Error {
  constructor(message: string, readonly code: number | null, readonly status: number) { super(message); }
  get expired() { return this.code === 190 || this.code === 102; }
  get limited() { return this.code != null && ([4, 17, 32, 613].includes(this.code) || (this.code >= 80000 && this.code <= 80014)); }
}

/** Prova de que a chamada vem do servidor do app (o token sozinho não basta). */
const proof = (token: string) => createHmac("sha256", process.env.META_APP_SECRET!.trim()).update(token).digest("hex");

async function call<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  } catch {
    throw new MetaError("Sem resposta do Meta", null, 0);
  }
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number } } & T;
  if (!res.ok || body.error) throw new MetaError(body.error?.message ?? `Meta respondeu ${res.status}`, body.error?.code ?? null, res.status);
  return body;
}
function get<T>(path: string, params: Record<string, string>, token: string) {
  const q = new URLSearchParams({ ...params, access_token: token, appsecret_proof: proof(token) });
  return call<T>(`${GRAPH()}/${path}?${q}`);
}

/** Troca o código pelo token e este pelo de longa duração (cerca de 60 dias). */
export async function exchangeCode(req: Request, code: string) {
  const app = { client_id: process.env.META_APP_ID!.trim(), client_secret: process.env.META_APP_SECRET!.trim() };
  const short = await call<{ access_token: string }>(`${GRAPH()}/oauth/access_token?${new URLSearchParams({ ...app, redirect_uri: metaRedirectUri(req), code })}`);
  const long = await call<{ access_token: string; expires_in?: number }>(`${GRAPH()}/oauth/access_token?${new URLSearchParams({ ...app, grant_type: "fb_exchange_token", fb_exchange_token: short.access_token })}`);
  return { token: long.access_token, expiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000) : null };
}

export const metaMe = (token: string) => get<{ id: string; name?: string }>("me", { fields: "id,name" }, token);

type Page<T> = { data?: T[]; paging?: { next?: string } };
async function pages<T>(first: Promise<Page<T>>, max: number) {
  const out: T[] = [];
  let page = await first;
  for (let i = 0; ; i++) {
    out.push(...(page.data ?? []));
    if (!page.paging?.next || i + 1 >= max) break;
    page = await call<Page<T>>(page.paging.next);
  }
  return out;
}

export type MetaAdAccount = { id: string; name: string; currency: string; status: number };
export async function adAccounts(token: string): Promise<MetaAdAccount[]> {
  const rows = await pages(get<Page<{ id: string; name?: string; currency?: string; account_status?: number }>>("me/adaccounts", { fields: "id,name,currency,account_status", limit: "100" }, token), 5);
  return rows.map((a) => ({ id: a.id, name: a.name ?? a.id, currency: a.currency ?? "BRL", status: a.account_status ?? 0 }));
}

export const INSIGHT_FIELDS = "campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,reach,clicks,inline_link_clicks,actions";
/** Os números de cada campanha, conjunto ou anúncio da conta no período (dias de Brasília: o fuso da conta). */
export async function insights(token: string, accountId: string, level: "campaign" | "adset" | "ad", range: { since: string; until: string }) {
  return pages(get<Page<Record<string, unknown>>>(`${accountId}/insights`, {
    level, fields: INSIGHT_FIELDS, time_range: JSON.stringify(range), limit: "500",
  }, token), 20);
}

/** Tira a permissão do app na conta do Facebook (ao desconectar). */
export async function revoke(token: string) {
  const q = new URLSearchParams({ access_token: token, appsecret_proof: proof(token) });
  await fetch(`${GRAPH()}/me/permissions?${q}`, { method: "DELETE", signal: AbortSignal.timeout(10_000) }).catch(() => undefined);
}
