// Métricas (Menu principal): período e comparação, cartões de vendas, recebível, carteira de clientes,
// equipe (emissores com rateio), contas (investido × valor de mercado) e os blocos escondidos.
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, Client, seedPrograms } from "./helpers";
import * as register from "@/app/api/auth/register/route";
import * as holders from "@/app/api/holders/route";
import * as accounts from "@/app/api/accounts/route";
import * as entries from "@/app/api/entries/route";
import * as sales from "@/app/api/sales/route";
import * as paymentRoute from "@/app/api/sales/[id]/payment/route";
import * as tagsRoute from "@/app/api/sales/[id]/tags/route";
import * as issuersRoute from "@/app/api/sales/[id]/issuers/route";
import * as customers from "@/app/api/customers/route";
import * as metricsPrefs from "@/app/api/preferences/metrics/route";
import { prisma } from "@/server/db";
import { salesMetrics, teamMetrics, accountMetrics, metricsHidden } from "@/server/services/metrics";
import { metricsWindow, salesKpis, receivableAging, teamRows, quoteConversion, accountsMetrics, type MetricSale } from "@/domain/metrics";

const ms = (o: Partial<MetricSale>): MetricSale => ({
  id: Math.random().toString(36).slice(2), date: `${o.day ?? "2026-11-02"}T00:00:00.000Z`, day: "2026-11-02",
  totalCents: 0, resultCents: 0, pricedCents: 0, costCents: 0, milesCostCents: 0, paidAt: null, refunded: false, tags: [], customers: [],
  issuerIds: [], accountId: null, programName: "LATAM", color: "#f00", items: [], ...o,
});

describe("métricas: contas puras", () => {
  it("período: mês corrente até hoje contra os mesmos dias do mês anterior; mês passado inteiro", () => {
    expect(metricsWindow(null, "2026-11-03")).toMatchObject({ month: "2026-11", label: "Novembro de 2026", from: "2026-11-01", to: "2026-11-03", prevFrom: "2026-10-01", prevTo: "2026-10-03", days: 3, current: true, nextMonth: null, prevMonth: "2026-10" });
    expect(metricsWindow("2026-10", "2026-11-03")).toMatchObject({ from: "2026-10-01", to: "2026-10-31", prevFrom: "2026-09-01", prevTo: "2026-09-30", days: 31, current: false, nextMonth: "2026-11" });
    // dia 31 de março compara até o último dia de fevereiro; mês futuro ou inválido vira o corrente
    expect(metricsWindow(null, "2026-03-31")).toMatchObject({ prevFrom: "2026-02-01", prevTo: "2026-02-28" });
    expect(metricsWindow("2027-01", "2026-11-03").month).toBe("2026-11");
    expect(metricsWindow("2026-13", "2026-11-03").month).toBe("2026-11");
    expect(metricsWindow("2026-01", "2026-11-03")).toMatchObject({ prevMonth: "2025-12", prevFrom: "2025-12-01", prevTo: "2025-12-31" });
  });

  it("cartões: reembolsada entra só com a taxa, não conta no ticket e conta no cancelamento", () => {
    const k = salesKpis([
      ms({ totalCents: 20500, resultCents: 10000, pricedCents: 20000, costCents: 10500, milesCostCents: 10000, paidAt: "2026-11-02", items: [{ kind: "FLIGHT", label: "Passagem", totalCents: 20500, resultCents: 10000, costs: [{ type: "IOF", amountCents: 500 }] }] }),
      ms({ totalCents: 15000, resultCents: 5000, pricedCents: 15000, costCents: 10000, milesCostCents: 10000 }),
      ms({ totalCents: 3000, resultCents: 3000, pricedCents: 3000, refunded: true }),
    ], 3, 4000);
    expect(k).toMatchObject({
      count: 3, activeCount: 2, revenueCents: 38500, profitCents: 18000, netProfitCents: 14000, expensesCents: 4000,
      ticketCents: 17750, receivableCents: 15000, receivedCents: 20500, milesCostCents: 20000, feesCents: 500, iofCents: 500,
      dailyAvg: 1, cancelPct: 33.3, marginPct: 47.4,
    });
  });

  it("recebível por idade e equipe com rateio entre emissores", () => {
    const a = receivableAging([ms({ day: "2026-11-03", totalCents: 100 }), ms({ day: "2026-10-01", totalCents: 300 }), ms({ day: "2026-08-01", totalCents: 50 }), ms({ day: "2026-11-01", totalCents: 999, paidAt: "x" })], "2026-11-03");
    expect(a).toMatchObject({ totalCents: 450, count: 3, oldestDays: 94, overdue30Cents: 350 });
    expect(a.buckets.map((b) => b.cents)).toEqual([100, 0, 0, 300, 50]);

    const members = [{ id: "m1", name: "Bia", color: "#111" }, { id: "m2", name: "Caio", color: "#222" }];
    const rows = teamRows([ms({ totalCents: 1000, resultCents: 400, pricedCents: 1000, issuerIds: ["m1", "m2"] }), ms({ totalCents: 600, resultCents: 100, pricedCents: 600, issuerIds: ["m1"] })], [ms({ resultCents: 200, issuerIds: ["m1"] })], members);
    expect(rows[0]).toMatchObject({ id: "m1", issues: 1.5, revenueCents: 1100, profitCents: 300, prevProfitCents: 200, profitGrowthPct: 50 });
    expect(rows[1]).toMatchObject({ id: "m2", issues: 0.5, revenueCents: 500, profitCents: 200, ticketCents: 1000 });
  });

  it("cotação → emissão e contas: valor de mercado só com programa que tem valor do milheiro", () => {
    expect(quoteConversion([{ issued: true, lost: false, valueCents: 500 }, { issued: false, lost: true, valueCents: 300 }, { issued: false, lost: true, valueCents: null }, { issued: false, lost: false, valueCents: 100 }]))
      .toMatchObject({ total: 4, issued: 1, lost: 2, open: 1, conversionPct: 25, issuedCents: 500, lostCents: 300, lostWithValue: 1 });
    const m = accountsMetrics([
      { id: "a1", programId: "p1", programName: "LATAM", holderName: "Ana", color: "#f00", balance: 10000, costCents: 25000, marketValueCpmCents: 3000, club: true, cpf: { used: 5, limit: 25 } },
      { id: "a2", programId: "p2", programName: "Azul", holderName: "Ana", color: "#00f", balance: 5000, costCents: 10000, marketValueCpmCents: 0, club: false, cpf: null },
    ], [ms({ accountId: "a1", totalCents: 1000, resultCents: 300, pricedCents: 1000, milesCostCents: 600 })]);
    expect(m.kpis).toMatchObject({ investedCents: 35000, projectedCents: 30000, projectedProfitCents: 5000, projectedPct: 20, unpricedAccounts: 1, clubAccounts: 1, profitCents: 300 });
    expect(m.programs[0]).toMatchObject({ name: "LATAM", paidCpmCents: 2500, marketCpmCents: 3000, cpfPct: 20, roiPct: 50 });
    expect(m.programs[1]).toMatchObject({ name: "Azul", marketCpmCents: null, cpfPct: null });
  });
});

describe("métricas: com vendas de verdade", () => {
  const now = new Date("2026-11-03T15:00:00Z");
  let c: Client, userId: string, lat: string;

  beforeEach(async () => {
    await resetDb();
    const p = await seedPrograms();
    await prisma.program.update({ where: { id: p.latam.id }, data: { marketValueCpmCents: 3000 } });
    c = new Client();
    await c.call(register.POST, "POST", "/r", { name: "Ana", email: "ana@x.test", password: "senha-forte-1" });
    userId = (await prisma.user.findUniqueOrThrow({ where: { email: "ana@x.test" } })).id;
    const h = await c.call(holders.POST, "POST", "/h", { name: "Ana" });
    lat = (await c.call(accounts.POST, "POST", "/a", { holderId: h.data.item.id, programId: p.latam.id })).data.item.id;
    // 20.000 pontos por R$ 500,00 → CPM R$ 25,00
    await c.call(entries.POST, "POST", "/e", { accountId: lat, type: "PURCHASE", points: 20000, occurredAt: "2026-09-01", costs: [{ type: "PONTOS", amountCents: 50000 }] });
  });

  const customer = async (name: string) => (await c.call(customers.POST, "POST", "/c", { name, kind: "FINAL" })).data.item.id as string;
  const sale = async (occurredAt: string, points: number, priceCents: number, extra: Record<string, unknown> = {}) =>
    (await c.call(sales.POST, "POST", "/api/sales", { origin: "OWN", accountId: lat, occurredAt, items: [{ kind: "FLIGHT", issuedWith: "POINTS", points, salePriceCents: priceCents, passengers: 1, ...extra }] })).data.item.id as string;

  it("vendas, recebível, carteira, equipe e contas do mês", async () => {
    const x = await customer("Xavier"), y = await customer("Yara");
    await sale("2026-09-20", 2000, 6000, { customerIds: [x] }); // antes: Xavier já comprava; em aberto há 44 dias
    await sale("2026-10-02", 4000, 12000); // período de comparação, em aberto
    const a = await sale("2026-11-02", 4000, 20000, { customerIds: [x], costs: [{ type: "IOF", amountCents: 500 }] });
    const b = await sale("2026-11-03", 4000, 15000, { customerIds: [y] });
    expect((await c.call(paymentRoute.POST, "POST", "/p", { paid: true, date: "2026-11-02" }, { id: a })).status).toBe(200);
    await c.call(tagsRoute.PUT, "PUT", "/t", { tags: ["vip"] }, { id: a });

    const m = await salesMetrics(userId, {}, now);
    expect(m.window).toMatchObject({ from: "2026-11-01", to: "2026-11-03", prevFrom: "2026-10-01", prevTo: "2026-10-03" });
    expect(m.kpis).toMatchObject({ count: 2, revenueCents: 35500, profitCents: 15000, ticketCents: 17750, receivableCents: 15000, receivedCents: 20500, milesCostCents: 20000, feesCents: 500, iofCents: 500, marginPct: 42.9 });
    expect(m.prev).toMatchObject({ count: 1, revenueCents: 12000, profitCents: 2000 });
    expect(m.daily.find((d) => d.day === "2026-11-03")).toMatchObject({ revenue: 15000, profit: 5000, count: 1 });
    expect(m.aging).toMatchObject({ totalCents: 33000, count: 3, oldestDays: 44, overdue30Cents: 18000 });
    expect(m.portfolio).toMatchObject({ newCount: 1, newCents: 15000, returningCount: 1, returningCents: 20500 });
    expect(m.topTags).toEqual([{ tag: "vip", count: 1, revenueCents: 20500 }]);
    expect(m.topCustomers.map((t) => t.name)).toEqual(["Xavier", "Yara"]);
    // filtro por cliente
    expect((await salesMetrics(userId, { customerId: y }, now)).kpis).toMatchObject({ count: 1, revenueCents: 15000 });

    // Equipe: Bia e Caio dividem a venda A; Bia emitiu sozinha a B
    const bia = await prisma.teamMember.create({ data: { userId, name: "Bia", issuer: true } });
    const caio = await prisma.teamMember.create({ data: { userId, name: "Caio" } });
    expect((await c.call(issuersRoute.POST, "POST", "/i", { memberIds: [bia.id, caio.id] }, { id: a })).data.item.issuerIds).toEqual([bia.id, caio.id]);
    await c.call(issuersRoute.POST, "POST", "/i", { memberIds: [bia.id] }, { id: b });
    const t = await teamMetrics(userId, {}, now);
    expect(t.rows.map((r) => [r.name, r.issues, r.revenueCents, r.profitCents])).toEqual([["Bia", 1.5, 25250, 10000], ["Caio", 0.5, 10250, 5000]]);
    expect(t.kpis).toMatchObject({ issuers: 2, revenueCents: 35500, withoutIssuer: 0 });
    expect((await teamMetrics(userId, { memberId: caio.id }, now)).rows.map((r) => r.name)).toEqual(["Caio"]);

    // Contas: sobram 6.000 pts a R$ 25 (R$ 150) que valem R$ 180 a R$ 30 o milheiro
    const ac = await accountMetrics(userId, {}, now);
    expect(ac.kpis).toMatchObject({ accounts: 1, investedCents: 15000, projectedCents: 18000, projectedProfitCents: 3000, projectedPct: 20, revenueCents: 35500, profitCents: 15000 });
    expect(ac.programs[0]).toMatchObject({ name: "LATAM Pass", balance: 6000, paidCpmCents: 2500, marketCpmCents: 3000 });
  });

  it("emissores: só membros da própria equipe; blocos escondidos ficam salvos por usuário", async () => {
    const s = await sale("2026-11-02", 1000, 3000);
    const outro = new Client();
    await outro.call(register.POST, "POST", "/r", { name: "Outro", email: "o@x.test", password: "senha-forte-2" });
    const outroId = (await prisma.user.findUniqueOrThrow({ where: { email: "o@x.test" } })).id;
    const dele = await prisma.teamMember.create({ data: { userId: outroId, name: "Dele" } });
    expect((await c.call(issuersRoute.POST, "POST", "/i", { memberIds: [dele.id] }, { id: s })).status).toBe(404);
    expect((await outro.call(issuersRoute.POST, "POST", "/i", { memberIds: [] }, { id: s })).status).toBe(404);

    const r = await c.call(metricsPrefs.PUT, "PUT", "/m", { hidden: ["vendas.mix", "contas.roi", "inexistente"] });
    expect(r.data.item.hidden).toEqual(["vendas.mix", "contas.roi"]);
    expect(await metricsHidden(userId)).toEqual(["vendas.mix", "contas.roi"]);
    expect(await metricsHidden(outroId)).toEqual([]);
  });
});
