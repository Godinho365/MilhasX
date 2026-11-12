// Calendário e Visão geral renderizados no servidor: as visões (mês, semana, dia, lista), os tipos com contagem,
// os botões conforme a função, e os blocos da Visão geral.
import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CalEvent, CalView } from "@/domain/calendar";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {}, replace() {} }) }));
const { CalendarClient } = await import("@/app/app/calendario/client");
const { OverviewClient } = await import("@/app/app/visao-geral/client");

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el).replace(/ /g, " ");
const ev = (o: Partial<CalEvent> & Pick<CalEvent, "id" | "kind" | "title" | "date">): CalEvent => ({
  eventId: null, seriesDate: null, endDate: null, time: null, endTime: null, source: "SALE", href: null, editable: false, memberIds: [], customer: null,
  location: null, notes: null, detail: null, recurrence: "NONE", remind: true, done: false, ...o,
});
const events = [
  ev({ id: "a", kind: "BOARDING", title: "Embarque · GRU → LIS", date: "2026-11-12", detail: "Maria" }),
  ev({ id: "b", kind: "FOLLOWUP", title: "Ligar para a Maria", date: "2026-11-12", time: "09:00", source: "MANUAL", editable: true, eventId: "e1", seriesDate: "2026-11-12" }),
  ev({ id: "c", kind: "HOTEL", title: "Hospedagem · Lisboa", date: "2026-11-12", endDate: "2026-11-14" }),
  ev({ id: "d", kind: "TASK", title: "Tarefa feita", date: "2026-11-12", done: true }),
  ev({ id: "e", kind: "BIRTHDAY", title: "Aniversário · Pedro", date: "2026-11-20" }),
];
const props = (view: CalView, o: object = {}) => ({
  initial: { view, anchor: "2026-11-12", events }, today: "2026-11-12", members: [{ id: "m1", name: "Bia", color: null }], customers: [], me: null,
  canEdit: true, canTask: true, feed: { active: false, createdAt: null }, ...o,
});

describe("Calendário", () => {
  it("mês: 6 semanas de domingo a sábado, até 3 por dia e '+N mais', tipos com contagem, botões de quem edita", () => {
    const h = html(createElement(CalendarClient, props("mes")));
    expect(h).toContain("novembro de 2026");
    expect((h.match(/aria-label="Ver /g) ?? []).length).toBe(42);
    expect(h).toContain("+1 mais"); // 4 no dia 12
    expect(h).toContain("Embarque · GRU → LIS");
    expect(h).toMatch(/Embarque<\/span><span class="text-xs tabular-nums text-muted">1</);
    expect(h).toContain("Criar");
    expect(h).toContain("Importar");
    expect(h).toContain("Google Agenda");
    const ro = html(createElement(CalendarClient, props("mes", { canEdit: false, feed: null })));
    expect(ro).not.toContain(">Criar<");
    expect(ro).not.toContain("Importar");
    expect(ro).not.toContain("Google Agenda");
  });

  it("semana, dia e lista", () => {
    const w = html(createElement(CalendarClient, props("semana")));
    expect(w).toContain("8 de nov. – 14 de nov. de 2026");
    expect(w).toContain("Hospedagem · Lisboa");
    const d = html(createElement(CalendarClient, props("dia")));
    expect(d).toContain("Hoje");
    expect(d).toContain("4 eventos");
    expect(d).toContain("12/11 a 14/11");
    expect(d).toContain("line-through"); // tarefa concluída
    const l = html(createElement(CalendarClient, props("lista")));
    expect(l).toContain("Aniversário · Pedro");
    expect(l).toContain("Aniversariante");
  });
});

describe("Visão geral", () => {
  it("os blocos na ordem, com os dados; Personalizar", () => {
    const h = html(createElement(OverviewClient, {
      widgets: ["agenda", "kpis", "atalhos"], hidden: ["tarefas"], me: null, members: [],
      shortcuts: [{ href: "/app/calendario", label: "Calendário" }],
      data: {
        agenda: { today: "2026-11-12", events },
        kpis: { from: "2026-11-01", to: "2026-11-12", now: { revenueCents: 200_000, profitCents: 50_000, count: 4, ticketCents: 50_000, marginPct: 25 }, prev: { revenueCents: 100_000, profitCents: 60_000, count: 4, ticketCents: 25_000, marginPct: 60 } },
      },
    }));
    expect(h.indexOf('aria-label="Agenda"')).toBeLessThan(h.indexOf('aria-label="KPIs do mês"'));
    expect(h).toContain("Hoje");
    expect(h).toContain("R$ 2.000,00");
    expect(h).toContain("+100% vs. mês anterior");
    expect(h).toContain("-17% vs. mês anterior");
    expect(h).toContain("Margem 25%");
    expect(h).toContain("Personalizar");
    expect(h).not.toContain('aria-label="Tarefas"');
  });
});
