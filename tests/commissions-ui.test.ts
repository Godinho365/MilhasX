// Metas e comissões: as abas renderizadas no servidor (visão geral, regras, parceiros e extrato), com e sem
// permissão de editar.
import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {}, replace() {} }) }));
const { OverviewTab, RulesTab, PartnersTab, StatementTab } = await import("@/app/app/equipe/metas/commissions");

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el).replace(/ /g, " ");
const team = [
  { id: "m1", name: "Bia", color: "#22c55e", active: true, rules: 1, monthCents: 9_000, dueCents: 10_500, paidMonthCents: 0 },
  { id: "m2", name: "Caio", color: null as unknown as string, active: false, rules: 0, monthCents: 0, dueCents: 0, paidMonthCents: 0 }, // inativo e zerado: some
];
const partners = [{ id: "p1", name: "Indicador", active: true, monthSales: 2, monthRevenueCents: 140_000, monthCents: 4_000, dueCents: 4_000, paidMonthCents: 0 }];
const overview = { month: "2026-11-01", totals: { goalCents: 200_000, achievedCents: 140_000, dueCents: 14_500, paidMonthCents: 0 }, team, partners };
const rules = [
  { id: "r1", memberId: "m1", member: "Bia", memberColor: "#22c55e", kind: "PROFIT_PCT" as const, value: 500, base: "INDIVIDUAL" as const, tiers: [{ min: 5_000_000, value: 700 }], period: "MONTH" as const, startsAt: "2026-11-01", active: true },
  { id: "r2", memberId: "m1", member: "Bia", memberColor: "#22c55e", kind: "FIXED" as const, value: 1_000, base: "TEAM" as const, tiers: [], period: "QUARTER" as const, startsAt: "2026-10-01", active: false },
];

describe("abas de Metas e comissões", () => {
  it("visão geral: meta, realizado, a pagar e as tabelas; Pagar só para quem edita", () => {
    const h = html(createElement(OverviewTab, { o: overview, canEdit: true, accounts: [] }));
    expect(h).toContain("R$ 2.000,00"); // meta
    expect(h).toContain("70% da meta");
    expect(h).toContain("R$ 145,00"); // a pagar
    expect(h).toContain("Bia");
    expect(h).not.toContain("Caio");
    expect(h).toContain('aria-label="Pagar Bia"');
    expect(h).toContain('href="/app/equipe/metas?aba=extrato&amp;parceiro=p1"');
    expect(html(createElement(OverviewTab, { o: overview, canEdit: false, accounts: null }))).not.toContain("Pagar Bia");
    const sem = html(createElement(OverviewTab, { o: { ...overview, totals: { ...overview.totals, goalCents: null } }, canEdit: true, accounts: null }));
    expect(sem).toContain("Sem meta");
  });

  it("regras por membro com faixas e pausa; Nova regra só para quem edita", () => {
    const h = html(createElement(RulesTab, { rules, members: [{ id: "m1", name: "Bia" }], team, canEdit: true }));
    expect(h).toContain("5% do lucro · vendas que emitiu · mensal · 1 faixa");
    expect(h).toContain("R$ 50.000,00+: 7%");
    expect(h).toContain("Desde 4º tri/2026 · pausada");
    expect(h).toContain("Desde nov/2026");
    expect(h).toContain("Nova regra");
    const ro = html(createElement(RulesTab, { rules, members: [], team, canEdit: false }));
    expect(ro).not.toContain("Nova regra");
    expect(ro).not.toContain("Editar regra");
    expect(html(createElement(RulesTab, { rules: [], members: [], team: [], canEdit: true }))).toContain("Cadastre a equipe em Equipe primeiro");
  });

  it("parceiros e extrato", () => {
    expect(html(createElement(PartnersTab, { partners, canEdit: true, accounts: null, manageLink: true }))).toContain("Equipe › Parceiros");
    const people = [{ kind: "member" as const, id: "m1", name: "Bia", active: true }, { kind: "partner" as const, id: "p1", name: "Indicador", active: true }];
    const st = {
      rows: [
        { id: null, kind: "COMMISSION" as const, date: "2026-11-01", label: "Comissão nov/2026", amountCents: 9_000, note: null, finTransactionId: null },
        { id: "e1", kind: "PAYMENT" as const, date: "2026-11-05", label: "Pagamento", amountCents: 5_000, note: "Pix", finTransactionId: "f1" },
      ],
      earnedCents: 9_000, paidCents: 5_000, balanceCents: 4_000,
    };
    const h = html(createElement(StatementTab, { people, selected: people[0]!, st, canEdit: true, accounts: [] }));
    expect(h).toContain("Saldo a pagar");
    expect(h).toContain("R$ 40,00");
    expect(h).toContain("nov/2026");
    expect(h).toContain("no Financeiro");
    expect(h).toContain("− R$ 50,00");
    expect(h).toContain("Registrar pagamento");
    expect(h).toContain('<optgroup label="Parceiros">');
    expect(html(createElement(StatementTab, { people, selected: null, st: null, canEdit: true, accounts: null }))).toContain("Escolha de quem é o extrato");
  });
});
