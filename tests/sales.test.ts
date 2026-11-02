// Vendas de emissão: itens, custos repassados, fornecedor, exclusão, clientes e anexos.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resetDb, Client, seedPrograms } from "./helpers";
import * as register from "@/app/api/auth/register/route";
import * as holders from "@/app/api/holders/route";
import * as accounts from "@/app/api/accounts/route";
import * as entries from "@/app/api/entries/route";
import * as entry from "@/app/api/entries/[id]/route";
import * as sales from "@/app/api/sales/route";
import * as sale from "@/app/api/sales/[id]/route";
import * as refundRoute from "@/app/api/sales/[id]/refund/route";
import * as receiptRoute from "@/app/api/sales/[id]/refund/receipt/route";
import * as customers from "@/app/api/customers/route";
import * as customer from "@/app/api/customers/[id]/route";
import { prisma } from "@/server/db";
import { salesDashboard } from "@/server/services/extras";
import { refundDeadline } from "@/server/services/sales";

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

describe("editar venda", () => {
  it("refaz itens, lançamento e beneficiários mantendo a venda e o horário original", async () => {
    const cl = (await c.call(customers.POST, "POST", "/c", { name: "Cliente Um", kind: "FINAL", docType: "CPF", docNumber: "000.000.000-00" })).data.item.id;
    const r = await newSale({ items: [flight({ passengers: 2, customerIds: [cl] })] });
    const id = r.data.item.id as string;
    const before = await prisma.entry.findFirstOrThrow({ where: { type: "SALE" } });
    const p = await c.call(sale.PATCH, "PATCH", "/x", { origin: "OWN", accountId: lat, occurredAt: "2026-10-10", items: [flight({ points: 8000, salePriceCents: 26000, passengers: 1 })] }, { id });
    expect(p.status).toBe(200);
    const v = await view(id);
    expect(v).toMatchObject({ id, points: 8000, totalCents: 26000, cpfs: 1, customers: [] });
    expect(await acc(lat)).toMatchObject({ balance: 12000, costCents: 30000 });
    const after = await prisma.entry.findMany({ where: { type: "SALE" } });
    expect(after).toHaveLength(1);
    expect(after[0]!.points).toBe(-8000);
    expect(after[0]!.createdAt.getTime()).toBe(before.createdAt.getTime());
    // sem cliente nomeado, o passageiro da venda editada fica "Anônimo" (ocupa a vaga)
    expect(await prisma.accountBeneficiary.findMany({ where: { saleId: id }, select: { name: true, document: true } })).toEqual([{ name: "Anônimo", document: null }]);
  });

  it("edição com conta inválida não muda nada", async () => {
    const r = await newSale({ items: [flight()] });
    const id = r.data.item.id as string;
    const bad = await c.call(sale.PATCH, "PATCH", "/x", { origin: "OWN", accountId: "nao-existe", occurredAt: "2026-10-10", items: [flight()] }, { id });
    expect(bad.status).toBe(404);
    expect(await view(id)).toMatchObject({ points: 10000 });
    expect(await acc(lat)).toMatchObject({ balance: 10000 });
  });
});

describe("CPFs emitidos", () => {
  it("contam passagens e também a venda de milhas do CRM (item com passageiros)", async () => {
    const { saleCpfs } = await import("@/server/services/sales");
    expect(saleCpfs([
      { kind: "FLIGHT", issuedWith: "POINTS", passengers: 2, customers: [] },
      { kind: "OTHER", issuedWith: "POINTS", passengers: 1, customers: [] }, // CRM Milhas
      { kind: "BAGGAGE", issuedWith: "POINTS", passengers: null, customers: [] },
      { kind: "FLIGHT", issuedWith: "CASH", passengers: 3, customers: [] },
    ])).toBe(3);
  });
});

describe("reembolso de venda", () => {
  // o prazo é de 24 horas depois da emissão: o relógio fica no dia das vendas do teste (10/10)
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-10T20:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("prazo de 24 horas: pelo horário da venda do CRM, ou pelo registro da lançada à mão no mesmo dia", () => {
    expect(refundDeadline({ occurredAt: new Date("2026-11-02T01:54:31Z"), createdAt: new Date("2026-11-02T01:54:31Z") }).toISOString()).toBe("2026-11-03T01:54:31.000Z");
    expect(refundDeadline({ occurredAt: new Date("2026-11-02T00:00:00Z"), createdAt: new Date("2026-11-02T14:00:00Z") }).toISOString()).toBe("2026-11-03T14:00:00.000Z");
    // lançada depois, com data passada: conta do início do dia da venda em Brasília (vale até o fim desse dia)
    expect(refundDeadline({ occurredAt: new Date("2026-10-30T00:00:00Z"), createdAt: new Date("2026-11-02T14:00:00Z") }).toISOString()).toBe("2026-10-31T03:00:00.000Z");
  });

  it("depois de 24 horas não dá mais para reembolsar", async () => {
    const id = (await newSale({ items: [flight()] })).data.item.id;
    await prisma.sale.update({ where: { id }, data: { occurredAt: new Date("2026-10-10T15:30:00Z") } });
    expect((await view(id)).refundUntil).toBe("2026-10-11T15:30:00.000Z");
    vi.setSystemTime(new Date("2026-10-11T15:31:00Z"));
    const r = await refund(id, { feeCents: 10000, date: "2026-10-11" });
    expect(r.status).toBe(409);
    expect(r.data.erro).toContain("prazo de reembolso");
  });

  const refund = (id: string, body: Record<string, unknown>) => c.call(refundRoute.POST, "POST", `/api/sales/${id}/refund`, body, { id });
  const undo = (id: string) => c.call(refundRoute.DELETE, "DELETE", `/api/sales/${id}/refund`, undefined, { id });
  const receive = (id: string, kind: "miles" | "tax", date: string) => c.call(receiptRoute.POST, "POST", `/api/sales/${id}/refund/receipt`, { kind, date }, { id });

  it("milhas voltam com o custo da venda, taxa de embarque sai do faturamento e fica só a taxa de administração", async () => {
    const r = await newSale({ items: [flight({ costs: [{ type: "TAXA_EMBARQUE", amountCents: 8000 }] })] });
    const id = r.data.item.id;
    // compra mais cara depois da venda: o reembolso devolve o custo da venda (R$ 25), não o médio do dia
    await c.call(entries.POST, "POST", "/e", { accountId: lat, type: "PURCHASE", points: 10000, occurredAt: "2026-10-12", costs: [{ type: "PONTOS", amountCents: 40000 }] });
    expect((await refund(id, { feeCents: 10000, date: "2026-10-09" })).status).toBe(400); // antes da venda
    expect((await refund(id, { feeCents: 10000, date: "2026-10-15" })).status).toBe(200);
    // até o estorno da companhia as milhas ficam bloqueadas (a receber), fora do saldo
    expect(await acc(lat)).toMatchObject({ balance: 20000, costCents: 25000 + 40000 });
    expect(await prisma.entry.findFirstOrThrow({ where: { type: "SALE_REFUND" } })).toMatchObject({ status: "PENDING", points: 10000 });
    let d = await salesDashboard(userId);
    expect(d.totals.refundWaiting).toEqual({ sales: 1, points: 10000, taxCents: 8000 });
    expect((await receive(id, "miles", "2026-10-14")).status).toBe(400); // antes do reembolso
    expect((await receive(id, "miles", "2026-10-16")).status).toBe(200);
    expect((await receive(id, "miles", "2026-10-16")).status).toBe(409);
    expect(await acc(lat)).toMatchObject({ balance: 30000, costCents: 25000 + 40000 + 25000 });
    const e = await prisma.entry.findFirstOrThrow({ where: { type: "SALE_REFUND" } });
    expect(e).toMatchObject({ status: "CONFIRMED", points: 10000, costCents: 25000 });
    expect(e.occurredAt.toISOString().slice(0, 10)).toBe("2026-10-16");
    d = await salesDashboard(userId);
    expect(d.totals.refundWaiting).toEqual({ sales: 1, points: 0, taxCents: 8000 });
    expect((await receive(id, "tax", "2026-10-20")).status).toBe(200);
    expect((await view(id)).refund).toMatchObject({ taxCents: 8000, milesReceivedAt: "2026-10-16T00:00:00.000Z", taxReceivedAt: "2026-10-20T00:00:00.000Z" });
    const v = await view(id);
    // o CPF continua gasto (conta como emitido) e a taxa é de R$ 100 por CPF
    expect(v).toMatchObject({ totalCents: 10000, resultCents: 10000, costCents: 0, points: 0, cpfs: 1, roePct: null });
    expect(v.refund).toMatchObject({ feeCents: 10000, points: 10000, totalCents: 38000 });
    expect(await prisma.accountBeneficiary.count({ where: { saleId: id } })).toBe(1);
    d = await salesDashboard(userId);
    expect(d.totals).toMatchObject({ revenueCents: 10000, profitCents: 10000, points: 0, count: 0, refunds: 1, refundFeesCents: 10000, refundWaiting: { sales: 0, points: 0, taxCents: 0 } });
    // não reembolsa duas vezes nem edita reembolsada
    expect((await refund(id, { feeCents: 10000, date: "2026-10-15" })).status).toBe(409);
    expect((await c.call(sale.PATCH, "PATCH", `/api/sales/${id}`, { origin: "OWN", accountId: lat, occurredAt: "2026-10-10", items: [flight()] }, { id })).status).toBe(409);
  });

  it("dá para reembolsar no mesmo dia, mesmo com a venda gravada com horário (CRM Milhas)", async () => {
    const id = (await newSale({ items: [flight()] })).data.item.id;
    await prisma.sale.update({ where: { id }, data: { occurredAt: new Date("2026-10-10T15:30:00Z") } });
    await prisma.entry.updateMany({ where: { type: "SALE" }, data: { occurredAt: new Date("2026-10-10T15:30:00Z") } });
    expect((await refund(id, { feeCents: 10000, date: "2026-10-10" })).status).toBe(200);
    const e = await prisma.entry.findFirstOrThrow({ where: { type: "SALE_REFUND" } });
    expect(e.occurredAt.toISOString()).toBe("2026-10-10T15:30:00.000Z"); // não fica antes da venda no extrato
    // sem taxa repassada não há estorno de taxa para esperar
    expect((await view(id)).refund).toMatchObject({ milesReceivedAt: null, taxReceivedAt: "2026-10-10T15:30:00.000Z" });
    await receive(id, "miles", "2026-10-10");
    expect(await acc(lat)).toMatchObject({ balance: 20000, costCents: 50000 });
  });

  it("desfazer o reembolso tira as milhas de novo e a venda volta ao faturamento", async () => {
    const id = (await newSale({ items: [flight()] })).data.item.id;
    await refund(id, { feeCents: 10000, date: "2026-10-11" });
    expect((await undo(id)).status).toBe(200);
    expect(await acc(lat)).toMatchObject({ balance: 10000, costCents: 25000 });
    expect(await prisma.entry.count({ where: { type: "SALE_REFUND" } })).toBe(0);
    expect(await view(id)).toMatchObject({ totalCents: 30000, resultCents: 5000, points: 10000, refund: null });
  });

  it("confirmar o reembolso a receber no extrato marca o estorno das milhas", async () => {
    const id = (await newSale({ items: [flight()] })).data.item.id;
    await refund(id, { feeCents: 10000, date: "2026-10-11" });
    const e = await prisma.entry.findFirstOrThrow({ where: { type: "SALE_REFUND" } });
    expect((await c.call(entry.PATCH, "PATCH", `/api/entries/${e.id}`, { status: "CONFIRMED" }, { id: e.id })).status).toBe(200);
    expect(await acc(lat)).toMatchObject({ balance: 20000 });
    expect((await view(id)).refund.milesReceivedAt).not.toBeNull();
  });

  it("fornecedor: o saldo volta no estorno das milhas e não volta de novo ao excluir", async () => {
    const sup = await prisma.supplier.create({ data: { userId, name: "Fornecedor" } });
    const sa = await prisma.supplierAccount.create({ data: { userId, supplierId: sup.id, programId: latamId, balance: 50000, priceCpmCents: 1800 } });
    const id = (await newSale({ origin: "SUPPLIER", accountId: null, supplierAccountId: sa.id, items: [flight({ points: 30000, salePriceCents: 70000 })] })).data.item.id;
    await refund(id, { feeCents: 0, date: "2026-10-11" });
    expect((await prisma.supplierAccount.findUniqueOrThrow({ where: { id: sa.id } })).balance).toBe(20000);
    await receive(id, "miles", "2026-10-12");
    expect((await prisma.supplierAccount.findUniqueOrThrow({ where: { id: sa.id } })).balance).toBe(50000);
    await c.call(sale.DELETE, "DELETE", `/api/sales/${id}`, undefined, { id });
    expect((await prisma.supplierAccount.findUniqueOrThrow({ where: { id: sa.id } })).balance).toBe(50000);
  });

  it("isola por usuário", async () => {
    const id = (await newSale({ items: [flight()] })).data.item.id;
    const other = new Client();
    await other.call(register.POST, "POST", "/r", { name: "Bia", email: "bia@x.test", password: "senha-forte-1" });
    expect((await other.call(refundRoute.POST, "POST", `/api/sales/${id}/refund`, { feeCents: 0, date: "2026-10-11" }, { id })).status).toBe(404);
  });
});
