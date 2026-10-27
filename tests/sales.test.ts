// Vendas de emissão: itens, custos repassados, fornecedor, exclusão, clientes e anexos.
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, Client, seedPrograms } from "./helpers";
import * as register from "@/app/api/auth/register/route";
import * as holders from "@/app/api/holders/route";
import * as accounts from "@/app/api/accounts/route";
import * as entries from "@/app/api/entries/route";
import * as entry from "@/app/api/entries/[id]/route";
import * as sales from "@/app/api/sales/route";
import * as sale from "@/app/api/sales/[id]/route";
import * as customers from "@/app/api/customers/route";
import * as customer from "@/app/api/customers/[id]/route";
import { prisma } from "@/server/db";
import { salesDashboard } from "@/server/services/extras";

let c: Client;
let userId: string;
let lat: string;
let liv: string;
let latamId: string;

beforeEach(async () => {
  await resetDb();
  const p = await seedPrograms();
  latamId = p.latam.id;
  c = new Client();
  await c.call(register.POST, "POST", "/r", { name: "Ana", email: "ana@x.test", password: "senha-forte-1" });
  userId = (await prisma.user.findUniqueOrThrow({ where: { email: "ana@x.test" } })).id;
  const h = await c.call(holders.POST, "POST", "/h", { name: "Ana" });
  lat = (await c.call(accounts.POST, "POST", "/a", { holderId: h.data.item.id, programId: p.latam.id })).data.item.id;
  liv = (await c.call(accounts.POST, "POST", "/a", { holderId: h.data.item.id, programId: p.livelo.id })).data.item.id;
  // 20.000 pontos por R$ 500,00 → CPM R$ 25,00
  await c.call(entries.POST, "POST", "/e", { accountId: lat, type: "PURCHASE", points: 20000, occurredAt: "2026-10-01", costs: [{ type: "PONTOS", amountCents: 50000 }] });
});

const newSale = (body: Record<string, unknown>, who = c) => who.call(sales.POST, "POST", "/api/sales", { origin: "OWN", accountId: lat, occurredAt: "2026-10-10", ...body });
const flight = (extra: Record<string, unknown> = {}) => ({ kind: "FLIGHT", issuedWith: "POINTS", points: 10000, salePriceCents: 30000, passengers: 1, ...extra });
const view = async (id: string) => (await c.call(sale.GET, "GET", `/api/sales/${id}`, undefined, { id })).data.item;
const acc = (id: string) => prisma.account.findUniqueOrThrow({ where: { id } });

describe("venda de emissão", () => {
  it("passagem com custos repassados: total, custo, resultado e débito na conta", async () => {
    const cl = (await c.call(customers.POST, "POST", "/c", { name: "Cliente Um", kind: "FINAL", docType: "CPF", docNumber: "000.000.000-00" })).data.item.id;
    const card = await prisma.creditCard.create({ data: { userId, accountId: liv, name: "Cartão", pointsPerDollar: 220, closingDay: 1, dueDay: 10 } });
    const r = await newSale({ items: [flight({ costs: [{ type: "TAXA_EMBARQUE", amountCents: 8000, cardId: card.id }], customerIds: [cl], passengers: 2, reservation: "abc123", origin: "GRU", destination: "LIS" })] });
    expect(r.status).toBe(201);
    const v = await view(r.data.item.id);
    expect(v).toMatchObject({ totalCents: 38000, costCents: 33000, resultCents: 5000, points: 10000, customers: ["Cliente Um"] });
    expect(v.items[0]).toMatchObject({ label: "Passagem aérea", pointsCostCents: 25000, passengers: 2, reservation: "abc123", origin: "GRU" });
    expect(await acc(lat)).toMatchObject({ balance: 10000, costCents: 25000 });
    const e = await prisma.entry.findFirstOrThrow({ where: { type: "SALE" } });
    expect(e.description).toContain("Passagem aérea GRU → LIS");
  });

  it("preço médio por milheiro e margem não contam a taxa de embarque repassada", async () => {
    // 10.000 pts por R$ 300,00 + R$ 80,00 de taxa de embarque repassada ao cliente
    await newSale({ items: [flight({ costs: [{ type: "TAXA_EMBARQUE", amountCents: 8000 }] })] });
    const d = await salesDashboard(userId);
    expect(d.totals).toMatchObject({
      revenueCents: 38000, // faturamento: inclui a taxa (é o que entra)
      profitCents: 5000,
      avgPriceCpmCents: 3000, // R$ 300,00 ÷ 10 milheiros (antes: R$ 380,00 ÷ 10 = R$ 38,00)
      marginPct: 16.7, // R$ 50,00 ÷ R$ 300,00 (antes: ÷ R$ 380,00 = 13,2%)
    });
  });

  it("vários itens e emissão em dinheiro", async () => {
    const r = await newSale({ items: [flight({ points: 5000, salePriceCents: 15000 }), { kind: "HOTEL", issuedWith: "CASH", salePriceCents: 45000, cashCostCents: 40000 }] });
    const v = await view(r.data.item.id);
    // (15.000 − 5 milheiros × R$ 25) + (45.000 − 40.000)
    expect(v).toMatchObject({ totalCents: 60000, resultCents: 7500, points: 5000 });
    expect(await prisma.entry.count({ where: { type: "SALE" } })).toBe(1);
  });

  it("pontos de fornecedor: baixa o saldo dele e devolve ao excluir", async () => {
    const sup = await prisma.supplier.create({ data: { userId, name: "Fornecedor" } });
    const sa = await prisma.supplierAccount.create({ data: { userId, supplierId: sup.id, programId: latamId, balance: 50000, priceCpmCents: 1800 } });
    expect((await newSale({ origin: "SUPPLIER", accountId: null, supplierAccountId: sa.id, items: [flight({ points: 60000 })] })).status).toBe(422);
    const r = await newSale({ origin: "SUPPLIER", accountId: null, supplierAccountId: sa.id, items: [flight({ points: 30000, salePriceCents: 70000 })] });
    expect(r.status).toBe(201);
    expect(await view(r.data.item.id)).toMatchObject({ resultCents: 16000, program: "LATAM Pass · Fornecedor" });
    expect((await prisma.supplierAccount.findUniqueOrThrow({ where: { id: sa.id } })).balance).toBe(20000);
    expect(await prisma.entry.count({ where: { type: "SALE" } })).toBe(0);
    const id = r.data.item.id;
    expect((await c.call(sale.DELETE, "DELETE", `/api/sales/${id}`, undefined, { id })).status).toBe(200);
    expect((await prisma.supplierAccount.findUniqueOrThrow({ where: { id: sa.id } })).balance).toBe(50000);
  });

  it("excluir a venda devolve os pontos; excluir o lançamento no extrato exclui a venda", async () => {
    const a = await newSale({ items: [flight()] });
    await c.call(sale.DELETE, "DELETE", "/x", undefined, { id: a.data.item.id });
    expect(await acc(lat)).toMatchObject({ balance: 20000, costCents: 50000 });
    await newSale({ items: [flight()] });
    const e = await prisma.entry.findFirstOrThrow({ where: { type: "SALE" } });
    expect((await c.call(entry.DELETE, "DELETE", "/x", undefined, { id: e.id })).status).toBe(200);
    expect(await prisma.sale.count()).toBe(0);
    expect(await acc(lat)).toMatchObject({ balance: 20000 });
  });

  it("valida, não duplica com a mesma chave e isola por usuário", async () => {
    expect((await newSale({ items: [flight({ passengers: null })] })).status).toBe(400);
    expect((await newSale({ items: [] })).status).toBe(400);
    expect((await newSale({ items: [flight({ points: 999999 })] })).status).toBe(422);
    const k1 = await newSale({ items: [flight()], idempotencyKey: "4f0c2a8e-6c1b-4f7a-9d2e-1a2b3c4d5e6f" });
    const k2 = await newSale({ items: [flight()], idempotencyKey: "4f0c2a8e-6c1b-4f7a-9d2e-1a2b3c4d5e6f" });
    expect(k2.data.item.id).toBe(k1.data.item.id);
    expect(await prisma.sale.count()).toBe(1);
    const other = new Client();
    await other.call(register.POST, "POST", "/r", { name: "Bia", email: "bia@x.test", password: "senha-forte-2" });
    expect((await newSale({ items: [flight()] }, other)).status).toBe(404);
    const foreignCustomer = (await other.call(customers.POST, "POST", "/c", { name: "Dela", kind: "FINAL", docType: "CPF", docNumber: "111.111.111-11" })).data.item.id;
    expect((await newSale({ items: [flight({ customerIds: [foreignCustomer] })] })).status).toBe(404);
    expect((await other.call(sales.GET, "GET", "/api/sales")).data.items).toHaveLength(0);
  });
});

describe("clientes", () => {
  it("cadastra com tipo, identificador e documentos; edita; mostra a última compra", async () => {
    const r = await c.call(customers.POST, "POST", "/c", { name: "Agência X", kind: "AGENCY", docType: "CNPJ", docNumber: "00.000.000/0000-00", email: "X@Agencia.test", phone: "(11) 90000-0000", documents: [{ type: "RG", number: "12.345.678-9" }] });
    expect(r.status).toBe(201);
    const id = r.data.item.id;
    expect(await prisma.customer.findUniqueOrThrow({ where: { id } })).toMatchObject({ kind: "AGENCY", docType: "CNPJ", email: "x@agencia.test" });
    expect((await c.call(customer.PATCH, "PATCH", "/c", { name: "Agência Y", kind: "AGENCY", docType: "CNPJ", docNumber: "00.000.000/0000-00" }, { id })).status).toBe(200);
    await newSale({ occurredAt: "2026-10-12", items: [flight({ clientType: "AGENCY", customerIds: [id] })] });
    const list = (await c.call(customers.GET, "GET", "/c")).data.items;
    expect(list[0]).toMatchObject({ name: "Agência Y", purchases: 1 });
    expect(list[0].lastPurchase.slice(0, 10)).toBe("2026-10-12");
    expect((await c.call(customers.POST, "POST", "/c", { name: "Z", kind: "FINAL", email: "não é e-mail" })).status).toBe(400);
    expect((await c.call(customers.POST, "POST", "/c", { name: "Z", kind: "FINAL", docType: "CPF" })).status).toBe(400);
  });
});

describe("anexos da venda", () => {
  it("aceita PDF, recusa outro tipo e isola por usuário", async () => {
    const id = (await newSale({ items: [flight()] })).data.item.id;
    const { POST } = await import("@/app/api/sales/[id]/attachments/route");
    const send = (who: Client, body: Buffer) => POST(new Request(`http://localhost:3100/api/sales/${id}/attachments`, { method: "POST", headers: { cookie: who.cookie, "x-file-name": "bilhete.pdf" }, body: new Uint8Array(body) }), { params: Promise.resolve({ id }) });
    expect((await send(c, Buffer.from("%PDF-1.4\n"))).status).toBe(201);
    expect((await send(c, Buffer.from("texto qualquer"))).status).toBe(415);
    const other = new Client();
    await other.call(register.POST, "POST", "/r", { name: "Bia", email: "bia@x.test", password: "senha-forte-2" });
    expect((await send(other, Buffer.from("%PDF-1.4\n"))).status).toBe(404);
    expect((await view(id)).attachments).toBe(1);
  });
});
