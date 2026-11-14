// Balcão MilhasX: o bloco de encerradas (Negociações e Minhas propostas) renderizado no servidor: recolhido, com
// filtro concluídas/canceladas, busca pelo número, poucas de cada vez com "ver mais", limpar uma a uma ou todas, e as
// limpas fora da conta (com "Ver limpas").
import { describe, it, expect } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ClosedSection } from "@/app/app/balcao-milhasx/closed";

type Item = { id: number; ok: boolean };
// 14 encerradas, como na tela do usuário: #21 a #8, a #19 concluída
const items: Item[] = Array.from({ length: 14 }, (_, i) => ({ id: 21 - i, ok: 21 - i === 19 }));

const render = (p: { hidden?: number[]; canEdit?: boolean; openId?: number | null; list?: Item[] } = {}) =>
  renderToStaticMarkup(createElement(ClosedSection<Item>, {
    kind: "negociacoes", items: p.list ?? items, idOf: (t) => t.id, numberOf: (t) => t.id, done: (t) => t.ok,
    labels: { ok: "Concluídas", nao: "Canceladas" }, hidden: new Set(p.hidden ?? []), setHidden: async () => true,
    canEdit: p.canEdit ?? true, openId: p.openId ?? null,
    render: (list, action) => list.map((t) => createElement("div", { key: t.id, "data-row": t.id }, action(t) as ReactNode)),
  }));
const rows = (html: string) => [...html.matchAll(/data-row="(\d+)"/g)].map((m) => Number(m[1]));

describe("Balcão MilhasX: encerradas", () => {
  it("recolhidas por padrão, 5 de cada vez, filtros com contagem, busca e limpar", () => {
    const html = render();
    expect(html).toMatch(/<details class="pt-1">/); // sem open: recolhido
    expect(html).toContain("Encerradas (14)");
    expect(rows(html)).toEqual([21, 20, 19, 18, 17]);
    expect(html).toContain("Ver mais (9)");
    expect(html).toMatch(/aria-pressed="true"[^>]*>Todas \(14\)/);
    expect(html).toContain("Concluídas (1)");
    expect(html).toContain("Canceladas (13)");
    expect(html).toContain('aria-label="Buscar pelo número"');
    expect(html).toContain("Limpar encerradas");
    expect(html).toContain('aria-label="Limpar #21 da lista"');
  });

  it("abre sozinho quando a aberta é uma encerrada; poucas não têm busca nem 'ver mais'", () => {
    expect(render({ openId: 12 })).toMatch(/<details class="pt-1" open="">/);
    const few = render({ list: items.slice(0, 3) });
    expect(few).not.toContain("Ver mais");
    expect(few).not.toContain("Buscar pelo número");
    expect(render({ list: [] })).toBe("");
  });

  it("as limpas saem da conta e da lista, com 'Ver limpas'; quem só vê não limpa", () => {
    const html = render({ hidden: [21, 20, 99] });
    expect(html).toContain("Encerradas (12) · 2 limpa(s)");
    expect(rows(html)).toEqual([19, 18, 17, 16, 15]);
    expect(html).toContain("Ver limpas (2)");
    const viewer = render({ canEdit: false });
    expect(viewer).not.toContain("Limpar encerradas");
    expect(viewer).not.toContain("Limpar #21");
  });
});
