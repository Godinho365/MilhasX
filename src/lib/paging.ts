// Paginação no servidor: ler a página da URL, limitar ao total, fatiar e montar os links (mantendo os filtros da URL).

export type Paged = { page: number; pages: number; total: number; pageSize: number };
export type SearchParams = Record<string, string | string[] | undefined>;

/** Página pedida na URL (?page=3). Qualquer coisa que não seja inteiro ≥ 1 vira 1. */
export function pageParam(raw: string | string[] | undefined): number {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isSafeInteger(n) && n >= 1 ? n : 1;
}

/** Página dentro do total (página além da última mostra a última) e o skip/take da consulta. */
export function paging(total: number, page: number, pageSize: number): Paged & { skip: number; take: number } {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const p = Math.min(Math.max(Math.trunc(page) || 1, 1), pages);
  return { page: p, pages, total, pageSize, skip: (p - 1) * pageSize, take: pageSize };
}

/** Uma página de uma lista que já está na memória (quando junta fontes diferentes ou é calculada). */
export function paginate<T>(items: T[], page: number, pageSize: number): Paged & { items: T[] } {
  const { skip, take, ...meta } = paging(items.length, page, pageSize);
  return { ...meta, items: items.slice(skip, skip + take) };
}

/**
 * Link de cada página: mantém todos os parâmetros da URL (filtros, busca, período) e troca só o da página;
 * a 1ª sai sem ele. `param` muda o nome (segunda lista na mesma tela) e `hash` leva de volta à lista.
 */
export function pageHref(path: string, sp: SearchParams, param = "page", hash?: string) {
  return (p: number) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      if (k === param || v === undefined) continue;
      for (const x of Array.isArray(v) ? v : [v]) if (x !== "") u.append(k, x);
    }
    if (p > 1) u.set(param, String(p));
    const qs = u.toString();
    return `${path}${qs ? `?${qs}` : ""}${hash ? `#${hash}` : ""}`;
  };
}

/** Números que a barra mostra: a 1ª, a última e `siblings` de cada lado da atual; o resto vira "…". */
export function pageItems(page: number, pages: number, siblings = 1): (number | "gap")[] {
  const keep = new Set([1, pages]);
  for (let p = page - siblings; p <= page + siblings; p++) if (p >= 1 && p <= pages) keep.add(p);
  const out: (number | "gap")[] = [];
  for (const p of [...keep].sort((a, b) => a - b)) {
    const prev = out[out.length - 1];
    if (typeof prev === "number" && p - prev === 2) out.push(prev + 1); // "…" no lugar de um número só: mostra o número
    else if (typeof prev === "number" && p - prev > 2) out.push("gap");
    out.push(p);
  }
  return out;
}
