// CRM Milhas: negociações de venda de milhas, Kanban e venda lançada ao chegar em "Pago".
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, Client, seedPrograms } from "./helpers";
import * as register from "@/app/api/auth/register/route";
import * as holders from "@/app/api/holders/route";
import * as accounts from "@/app/api/accounts/route";
import * as entries from "@/app/api/entries/route";
import * as sale from "@/app/api/sales/[id]/route";
import * as deals from "@/app/api/miles-deals/route";
import * as deal from "@/app/api/miles-deals/[id]/route";
import * as move from "@/app/api/miles-deals/[id]/move/route";
import { prisma } from "@/server/db";

let c: Client;
let lat: string;

beforeEach(async () => {
  await resetDb();
  const p = await seedPrograms();
  c = new Client();
  await c.call(register.POST, "POST", "/r", { name: "Ana", email: "ana@x.test", password: "senha-forte-1" });
  const h = await c.call(holders.POST, "POST", "/h", { name: "Ana" });
  lat = (await c.call(accounts.POST, "POST", "/a", { holderId: h.data.item.id, programId: p.latam.id })).data.item.id;
  // 20.000 pontos por R$ 500,00 → CPM R$ 25,00
  await c.call(entries.POST, "POST", "/e", { accountId: lat, type: "PURCHASE", points: 20000, occurredAt: "2026-10-01", costs: [{ type: "PONTOS", amountCents: 50000 }] });
});

const acc = (id: string) => prisma.account.findUniqueOrThrow({ where: { id } });
const newDeal = (body: Record<string, unknown> = {}) => c.call(deals.POST, "POST", "/x", { buyerType: "AGENCY", customerName: "Agência Voa", ...body });

describe("CRM Milhas", () => {
  it("cria com número sequencial, total e lucro estimado pelo CPM da conta", async () => {
    const a = (await newDeal({ accountId: lat, points: 10000, saleCpmCents: 3000 })).data.item;
    const b = (await newDeal({ buyerType: "BALCAO", customerName: "HotMilhas" })).data.item;
    expect([a.number, b.number]).toEqual([1, 2]);
    expect(a).toMatchObject({ stage: "NEW", totalCents: 30000, costCpmCents: 2500, profitCents: 5000 }); // 10 mil × (R$ 30 − R$ 25)
    expect(b).toMatchObject({ totalCents: null, profitCents: null, accountId: null });
    expect((await newDeal({ customerName: " " })).status).toBe(400);

    // Lucro digitado à mão vale no lugar do estimado (inclusive negativo); vazio volta ao estimado
    const manual = (await c.call(deal.PUT, "PUT", "/x", { buyerType: "AGENCY", customerName: "Agência Voa", accountId: lat, points: 10000, saleCpmCents: 3000, profitCents: 7500 }, { id: a.id })).data.item;
    expect(manual).toMatchObject({ profitCents: 7500, profitManual: true, estimatedProfitCents: 5000 });
    expect((await c.call(deal.PUT, "PUT", "/x", { buyerType: "BALCAO", customerName: "HotMilhas", profitCents: -2000 }, { id: b.id })).data.item).toMatchObject({ profitCents: -2000, customerName: "HotMilhas" });
    expect((await c.call(deal.PUT, "PUT", "/x", { buyerType: "AGENCY", customerName: "Agência Voa", accountId: lat, points: 10000, saleCpmCents: 3000, profitCents: null }, { id: a.id })).data.item).toMatchObject({ profitCents: 5000, profitManual: false });
  });

  it("ao mover para Pago lança a venda uma vez, baixa os pontos e trava a negociação", async () => {
    const d = (await newDeal({ customerName: "Agência Voa" })).data.item;
    // Sem conta, pontos e milheiro não fecha
    expect((await c.call(move.POST, "POST", "/x", { stage: "PAID" }, { id: d.id })).status).toBe(400);
    await c.call(deal.PUT, "PUT", "/x", { buyerType: "AGENCY", customerName: "Agência Voa", accountId: lat, points: 30000, saleCpmCents: 3000 }, { id: d.id });
    expect((await c.call(move.POST, "POST", "/x", { stage: "PAID" }, { id: d.id })).status).toBe(422); // só há 20.000 pontos
    await c.call(deal.PUT, "PUT", "/x", { buyerType: "AGENCY", customerName: "Agência Voa", accountId: lat, points: 10000, saleCpmCents: 3000 }, { id: d.id });

    expect((await c.call(move.POST, "POST", "/x", { stage: "NEGOTIATION" }, { id: d.id })).data.item.stage).toBe("NEGOTIATION");
    const paid = (await c.call(move.POST, "POST", "/x", { stage: "PAID" }, { id: d.id })).data.item;
    expect(paid.saleId).toBeTruthy();
    expect(await acc(lat)).toMatchObject({ balance: 10000, costCents: 25000 });
    const s = await prisma.sale.findUniqueOrThrow({ where: { id: paid.saleId }, include: { items: true } });
    expect(s).toMatchObject({ points: 10000, totalCents: 30000 });
    expect(s.items[0]).toMatchObject({ kind: "OTHER", clientType: "AGENCY", points: 10000, salePriceCents: 30000 });

    // De novo em Pago não duplica; voltar de etapa, mudar a venda ou excluir é bloqueado
    await c.call(move.POST, "POST", "/x", { stage: "PAID", position: 0 }, { id: d.id });
    expect(await prisma.sale.count()).toBe(1);
    expect((await c.call(move.POST, "POST", "/x", { stage: "ISSUED" }, { id: d.id })).status).toBe(409);
    expect((await c.call(deal.PUT, "PUT", "/x", { buyerType: "AGENCY", customerName: "Agência Voa", accountId: lat, points: 5000, saleCpmCents: 3000 }, { id: d.id })).status).toBe(409);
    expect((await c.call(deal.PUT, "PUT", "/x", { buyerType: "AGENCY", customerName: "Agência Voa Ltda", accountId: lat, points: 10000, saleCpmCents: 3000 }, { id: d.id })).status).toBe(200);
    expect((await c.call(deal.DELETE, "DELETE", "/x", undefined, { id: d.id })).status).toBe(409);

    // Excluindo a venda em Vendas, os pontos voltam e a negociação pode reabrir
    expect((await c.call(sale.DELETE, "DELETE", "/x", undefined, { id: paid.saleId })).status).toBe(200);
    expect(await acc(lat)).toMatchObject({ balance: 20000 });
    expect((await c.call(move.POST, "POST", "/x", { stage: "ISSUED" }, { id: d.id })).data.item).toMatchObject({ stage: "ISSUED", saleId: null });
  });

  it("isola por usuário", async () => {
    const d = (await newDeal()).data.item;
    const o = new Client();
    await o.call(register.POST, "POST", "/r", { name: "Bia", email: "bia@x.test", password: "senha-forte-1" });
    expect((await o.call(deals.GET, "GET", "/x")).data.items).toEqual([]);
    expect((await o.call(move.POST, "POST", "/x", { stage: "PAID" }, { id: d.id })).status).toBe(404);
    expect((await o.call(deals.POST, "POST", "/x", { buyerType: "FINAL", customerName: "X", accountId: lat })).status).toBe(404);
  });
});
