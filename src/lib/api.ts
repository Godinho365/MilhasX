"use client";

export type ApiResult<T = any> = { ok: true; status: number; data: T } | { ok: false; status: number; erro: string };

export async function api<T = any>(path: string, method = "GET", body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method,
      headers: body !== undefined ? { "content-type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) return { ok: false, status: res.status, erro: data.erro || `Erro ${res.status}` };
    return { ok: true, status: res.status, data };
  } catch {
    return { ok: false, status: 0, erro: "Sem conexão com o servidor" };
  }
}

export const newKey = () => crypto.randomUUID();
export const today = () => new Date().toISOString().slice(0, 10);
