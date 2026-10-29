/** Cliente HTTP das rotas internas (/api/*): JSON, mesma origem, resposta normalizada. */

export type ApiOk<T> = { ok: true; data: T; status: number };
export type ApiFail = { ok: false; erro: string; status: number; campos?: Record<string, string[] | undefined> };
export type ApiResult<T> = ApiOk<T> | ApiFail;

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * `api("/api/x", "POST", { ... })` → `{ ok: true, data }` ou `{ ok: false, erro }`.
 * Nunca lança: falhas de rede e respostas sem JSON viram `{ ok: false, erro }`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function api<T = any>(url: string, method: Method = "GET", body?: unknown): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      credentials: "same-origin",
      headers: { Accept: "application/json", ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
  } catch {
    return { ok: false, erro: "Sem conexão. Verifique a internet e tente de novo.", status: 0 };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok || j?.ok === false) {
    const erro = typeof j?.erro === "string" ? j.erro : res.status === 401 ? "Sessão expirada. Entre de novo." : `Erro ${res.status}`;
    return { ok: false, erro, status: res.status, campos: j?.campos };
  }
  return { ok: true, data: j as T, status: res.status };
}

/** Chave de idempotência para lançamentos (um por formulário aberto). */
export function newKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Data de hoje no fuso local, no formato dos <input type="date"> (AAAA-MM-DD). */
export function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
