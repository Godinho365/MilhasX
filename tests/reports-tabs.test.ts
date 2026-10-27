// Abas de Relatórios no formato da referência: indicadores e seções calculados dos lançamentos
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, Client, seedPrograms } from "./helpers";
import * as register from "@/app/api/auth/register/route";
import * as holders from "@/app/api/holders/route";
import * as accounts from "@/app/api/accounts/route";
import * as entries from "@/app/api/entries/route";
import * as purchases from "@/app/api/purchases/route";
import * as receive from "@/app/api/purchases/[id]/receive/route";
import * as cards from "@/app/api/cards/route";
import * as invoices from "@/app/api/cards/[id]/invoices/route";
import * as invoiceClose from "@/app/api/invoices/[id]/close/route";
import * as entry from "@/app/api/entries/[id]/route";
import { purchasesReport, cardsReport, savingsReport, evolutionReport, assetsReport, exportReportCsv, REPORT_TABS } from "@/server/services/reports";

let c: Client;
let userId: string;
let liv: string;
let lat: string;
const all = () => ({ userId, period: { key: "all" as const } });

beforeEach(async () => {
  await resetDb();
  const p = await seedPrograms();
  c = new Client();
  userId = (await c.call(register.POST, "POST", "/r", { name: "Ana", email: "ana@x.test", password: "senha-forte-1" })).data.user.id;
  const h = (await c.call(holders.POST, "POST", "/api/holders", { name: "Ana" })).data.item.id;
  liv = (await c.call(accounts.POST, "POST", "/api/accounts", { holderId: h, programId: p.livelo.id })).data.item.id;
  lat = (await c.call(accounts.POST, "POST", "/api/accounts", { holderId: h, programId: p.latam.id })).data.item.id;
});
const add = (body: Record<string, unknown>) => c.call(entries.POST, "POST", "/api/entries", { occurredAt: "2026-10-01", ...body });

describe("relatórios", () => {
  it("Compras: acompanhadas e diretas, status, custo extra e multiplicador", async () => {
    const p1 = await c.call(purchases.POST, "POST", "/p", { accountId: liv, storeName: "Loja A", purchasedAt: "2026-10-01", amountCents: 100000, extraCostCents: 3000, pointsPerReal: 1000 });
    await c.call(purchases.POST, "POST", "/p", { accountId: liv, storeName: "Loja B", purchasedAt: "2026-10-02", amountCents: 50000, pointsPerReal: 400 });
    await c.call(receive.POST, "POST", "/x", { receivedAt: "2026-10-20" }, { id: p1.data.item.id });
    await add({ accountId: lat, type: "PARTNER_PURCHASE", points: 500 });
    const r = await purchasesReport(all());
    expect(r.totals).toMatchObject({ points: 10000 + 2000 + 500, extraCents: 3000, count: 3 });
    expect(r.totals.cpmCents).toBe(Math.round((3000 * 1000) / 12500));
    expect(r.byStatus).toEqual([{ name: "Aguardando entrega", value: 2000 }, { name: "Pontos recebidos", value: 10000 }]);
    expect(r.origin).toEqual([{ name: "Acompanhamento de compras", value: 12000 }, { name: "Lançamento direto", value: 500 }]);
    expect(r.multiplier).toEqual([{ name: "Loja A", value: 10 }, { name: "Loja B", value: 4 }]);
  });

  it("Cartões: faturas por status, recebidos e pontos por real", async () => {
    const card = (await c.call(cards.POST, "POST", "/c", { accountId: liv, name: "Black", pointsPerDollar: 220, dollarRateCents: 550, closingDay: 3, dueDay: 10 })).data.item.id;
    const inv = (await c.call(invoices.POST, "POST", "/i", { closingDate: "2026-10-03", dueDate: "2026-10-10", amountCents: 450000 }, { id: card })).data.item;
    await c.call(invoices.POST, "POST", "/i", { closingDate: "2026-11-03", dueDate: "2026-11-10", amountCents: 100000 }, { id: card });
    const closed = await c.call(invoiceClose.POST, "POST", "/x", undefined, { id: inv.id });
    await c.call(entry.PATCH, "PATCH", "/e", { status: "CONFIRMED" }, { id: closed.data.item.entryId });
    const r = await cardsReport(all());
    expect(r.totals).toMatchObject({ receivedPoints: 1800, invoicedCents: 550000, invoices: 2, pending: 1, pointsPerReal: 0.4 });
    expect(r.byStatus).toEqual([{ name: "Abertas", value: 1 }, { name: "Recebidas", value: 1 }]);
    expect(r.top[0]).toMatchObject({ name: "Black", points: 1800 });
  });

  it("Economia: só resgates com valor de referência", async () => {
    await add({ accountId: lat, type: "PURCHASE", points: 20000, costs: [{ type: "PONTOS", amountCents: 50000 }] });
    await add({ accountId: lat, type: "FLIGHT_REDEMPTION", points: 10000, costs: [{ type: "TAXA_EMBARQUE", amountCents: 5000 }], details: { cashReferenceCents: 100000 } });
    await add({ accountId: lat, type: "FLIGHT_REDEMPTION", points: 1000 });
    const r = await savingsReport(all());
    // R$ 1.000 − (R$ 250 dos pontos + R$ 50 de taxa)
    expect(r.totals).toEqual({ savingCents: 70000, redemptions: 1 });
    expect(r.byProgram[0]).toMatchObject({ name: "LATAM Pass", value: 70000 });
  });

  it("Evolução e Bens e Direitos", async () => {
    await add({ accountId: liv, type: "PURCHASE", points: 10000, costs: [{ type: "PONTOS", amountCents: 30000 }], occurredAt: "2025-06-01" });
    await add({ accountId: liv, type: "EXPIRATION", points: 2000, occurredAt: "2026-02-01" });
    const ev = await evolutionReport(all());
    expect(ev.totals).toEqual({ delta: 8000, credits: 10000, debits: 2000 });
    expect(ev.creditCats.series).toEqual([{ name: "Compra de pontos", value: 10000 }]);
    const as = await assetsReport({ userId });
    expect(as.cuts.map((x) => x.label)).toEqual(["31/12/2025", "Posição atual"]);
    expect(as.rows[0]!.cells[0]).toEqual({ points: 10000, costCents: 30000, cpmCents: 3000 });
    expect(as.totals[1]).toMatchObject({ points: 8000 });
  });

  it("exporta CSV de todas as abas", async () => {
    for (const t of REPORT_TABS) expect((await exportReportCsv(t, all())).rows.length).toBeGreaterThan(0);
  });
});
