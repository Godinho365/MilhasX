import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { resetDb, Client, seedPrograms } from "./helpers";
import * as register from "@/app/api/auth/register/route";
import * as holders from "@/app/api/holders/route";
import * as holderRoute from "@/app/api/holders/[id]/route";
import * as accounts from "@/app/api/accounts/route";
import * as entries from "@/app/api/entries/route";
import * as entry from "@/app/api/entries/[id]/route";
import * as transfers from "@/app/api/transfers/route";
import * as transferRoute from "@/app/api/transfers/[groupId]/route";
import * as sales from "@/app/api/sales/route";
import * as summary from "@/app/api/summary/route";
import * as alerts from "@/app/api/alerts/route";
import * as notifications from "@/app/api/notifications/route";
import * as reports from "@/app/api/reports/route";
import * as batch from "@/app/api/entries/batch/route";
import * as bulkDelete from "@/app/api/entries/bulk-delete/route";
import { prisma } from "@/server/db";
import { evolutionByHolder } from "@/server/services/wallet";

let c: Client;
let liv: string;
let lat: string;

beforeEach(async () => {
  await resetDb();
  const p = await seedPrograms();
  c = new Client();
  await c.call(register.POST, "POST", "/api/auth/register", { name: "Ana", email: "ana@x.test", password: "senha-forte-1" });
  const h = await c.call(holders.POST, "POST", "/api/holders", { name: "Ana" });
  liv = (await c.call(accounts.POST, "POST", "/api/accounts", { holderId: h.data.item.id, programId: p.livelo.id })).data.item.id;
  lat = (await c.call(accounts.POST, "POST", "/api/accounts", { holderId: h.data.item.id, programId: p.latam.id })).data.item.id;
});

const add = (body: Record<string, unknown>) => c.call(entries.POST, "POST", "/api/entries", { occurredAt: "2026-10-21", ...body });

async function assertConsistent() {
  for (const a of await prisma.account.findMany()) {
    const sum = await prisma.entry.aggregate({ where: { accountId: a.id, status: "CONFIRMED" }, _sum: { points: true, costCents: true } });
    expect(a.balance).toBe(sum._sum.points ?? 0);
    expect(a.costCents).toBe(sum._sum.costCents ?? 0);
    expect(a.balance).toBeGreaterThanOrEqual(0);
  }
}

describe("carteiras e movimentações", () => {
  it("fluxo completo: compra, clube, transferência com bônus e venda", async () => {
    expect((await add({ accountId: liv, type: "CLUB", points: 2000, costCents: 4990 })).status).toBe(201);
    expect((await add({ accountId: liv, type: "PURCHASE", points: 18000, costCents: 55800, occurredAt: "2026-10-22" })).status).toBe(201);
    const t = await c.call(transfers.POST, "POST", "/api/transfers", { fromAccountId: liv, toAccountId: lat, points: 20000, bonusPercent: 25, occurredAt: "2026-10-23" });
    expect(t.status).toBe(201);

    let s = await c.call(summary.GET, "GET", "/api/summary");
    const latRow = s.data.accounts.find((a: any) => a.id === lat);
    expect(latRow).toMatchObject({ balance: 25000, costCents: 60790, cpmCents: 2432 });

    const sale = await c.call(sales.POST, "POST", "/api/sales", { origin: "OWN", accountId: lat, occurredAt: "2026-10-24", items: [{ kind: "OTHER", issuedWith: "POINTS", points: 10000, salePriceCents: 27500 }] });
    expect(sale.status).toBe(201);
    expect(sale.data.item.totalCents).toBe(27500);
    const listed = (await c.call(sales.GET, "GET", "/api/sales")).data.items[0];
    expect(listed.costCents).toBe(24316);
    expect(listed.resultCents).toBe(27500 - 24316);

    s = await c.call(summary.GET, "GET", "/api/summary");
    expect(s.data.totals.balance).toBe(15000);
    await assertConsistent();
  });

  it("valida entradas inválidas", async () => {
    expect((await add({ accountId: liv, type: "PURCHASE", points: -5 })).status).toBe(400);
    expect((await add({ accountId: liv, type: "PURCHASE", points: 1.5 })).status).toBe(400);
    expect((await add({ accountId: liv, type: "TRANSFER_IN", points: 10 })).status).toBe(400);
    expect((await add({ accountId: liv, type: "CARD", points: 10, occurredAt: "21/10/2026" })).status).toBe(400);
    expect((await add({ accountId: liv, type: "EXPIRATION", points: 10, costCents: 100 })).status).toBe(400);
    expect((await c.call(entries.POST, "POST", "/api/entries", "{not json")).status).toBe(400);
    expect((await c.call(transfers.POST, "POST", "/api/transfers", { fromAccountId: liv, toAccountId: liv, points: 1, bonusPercent: 0, occurredAt: "2026-10-21" })).status).toBe(400);
  });

  it("impede saldo negativo e desfaz a operação inteira", async () => {
    await add({ accountId: liv, type: "CARD", points: 1000 });
    const r = await c.call(transfers.POST, "POST", "/api/transfers", { fromAccountId: liv, toAccountId: lat, points: 5000, bonusPercent: 0, occurredAt: "2026-10-22" });
    expect(r.status).toBe(422);
    expect(await prisma.entry.count()).toBe(1);
    await assertConsistent();
  });

  it("editar um crédito antigo recalcula tudo; edição que gera saldo negativo é recusada", async () => {
    const credit = await add({ accountId: liv, type: "PURCHASE", points: 10000, costCents: 30000 });
    await c.call(transfers.POST, "POST", "/api/transfers", { fromAccountId: liv, toAccountId: lat, points: 8000, bonusPercent: 0, occurredAt: "2026-10-22" });
    const ok = await c.call(entry.PATCH, "PATCH", "/x", { costCents: 20000 }, { id: credit.data.item.id });
    expect(ok.status).toBe(200);
    expect((await prisma.account.findUniqueOrThrow({ where: { id: lat } })).costCents).toBe(16000);
    const bad = await c.call(entry.PATCH, "PATCH", "/x", { points: 5000 }, { id: credit.data.item.id });
    expect(bad.status).toBe(422);
    await assertConsistent();
  });

  it("excluir uma perna da transferência exclui o grupo", async () => {
    await add({ accountId: liv, type: "CARD", points: 1000 });
    await c.call(transfers.POST, "POST", "/api/transfers", { fromAccountId: liv, toAccountId: lat, points: 1000, bonusPercent: 10, occurredAt: "2026-10-22" });
    const bonus = await prisma.entry.findFirstOrThrow({ where: { type: "TRANSFER_BONUS" } });
    const d = await c.call(entry.DELETE, "DELETE", "/x", undefined, { id: bonus.id });
    expect(d.data.deleted).toBe(3);
    await assertConsistent();
  });

  it("excluir a transferência pelo destino leva junto a compra de pontos do carrinho na origem", async () => {
    await add({ accountId: liv, type: "CARD", points: 1000 });
    await c.call(transfers.POST, "POST", "/api/transfers", { fromAccountId: liv, toAccountId: lat, points: 10000, bonusPercent: 30, occurredAt: "2026-10-22", purchase: { points: 9000, priceCents: 27000 } });
    expect(await prisma.entry.count()).toBe(5);
    const inLatam = await prisma.entry.findFirstOrThrow({ where: { type: "TRANSFER_IN" } });
    const d = await c.call(entry.DELETE, "DELETE", "/x", undefined, { id: inLatam.id });
    expect(d.data.deleted).toBe(4);
    expect(await prisma.entry.findMany({ select: { type: true } })).toEqual([{ type: "CARD" }]);
    expect(await prisma.account.findUniqueOrThrow({ where: { id: liv } })).toMatchObject({ balance: 1000 });
    await assertConsistent();
  });

  it("pontos a receber aparecem separados do saldo", async () => {
    await add({ accountId: liv, type: "PURCHASE", points: 5000, costCents: 10000, status: "PENDING" });
    const s = await c.call(summary.GET, "GET", "/api/summary");
    expect(s.data.totals).toMatchObject({ balance: 0, pendingPoints: 5000 });
  });
});

describe("prevenção de duplicidade e concorrência", () => {
  it("mesma chave de envio não duplica (inclusive em paralelo)", async () => {
    const key = randomUUID();
    const body = { accountId: liv, type: "CARD", points: 100, idempotencyKey: key };
    const rs = await Promise.all([add(body), add(body), add(body)]);
    expect(rs.every((r) => r.status === 200 || r.status === 201)).toBe(true);
    expect(await prisma.entry.count()).toBe(1);
    const tkey = randomUUID();
    const tb = { fromAccountId: liv, toAccountId: lat, points: 50, bonusPercent: 0, occurredAt: "2026-10-22", idempotencyKey: tkey };
    await Promise.all([c.call(transfers.POST, "POST", "/t", tb), c.call(transfers.POST, "POST", "/t", tb)]);
    expect(await prisma.entry.count({ where: { type: "TRANSFER_OUT" } })).toBe(1);
  });

  it("débitos concorrentes não deixam o saldo negativo", async () => {
    await add({ accountId: liv, type: "CARD", points: 1000 });
    const rs = await Promise.all(
      Array.from({ length: 5 }, () => add({ accountId: liv, type: "OTHER_DEBIT", points: 300, occurredAt: "2026-10-22" })),
    );
    expect(rs.filter((r) => r.status === 201)).toHaveLength(3);
    expect(rs.filter((r) => r.status === 422)).toHaveLength(2);
    await assertConsistent();
  });
});

describe("lote e exclusão em lote", () => {
  it("lote é tudo ou nada e não duplica com a mesma chave", async () => {
    const key = randomUUID();
    const ok = { items: [
      { accountId: liv, type: "INITIAL_BALANCE", points: 5000, occurredAt: "2026-10-01" },
      { accountId: liv, type: "FLIGHT", points: 700, occurredAt: "2026-10-02" },
    ], idempotencyKey: key };
    expect((await c.call(batch.POST, "POST", "/b", ok)).status).toBe(201);
    expect((await c.call(batch.POST, "POST", "/b", ok)).data.duplicated).toBe(true);
    expect(await prisma.entry.count()).toBe(2);

    const bad = { items: [
      { accountId: lat, type: "BONUS", points: 100, occurredAt: "2026-10-03" },
      { accountId: lat, type: "OTHER_DEBIT", points: 999999, occurredAt: "2026-10-03" },
    ] };
    expect((await c.call(batch.POST, "POST", "/b", bad)).status).toBe(422);
    expect(await prisma.entry.count()).toBe(2);
    await assertConsistent();
  });

  it("exclusão em lote leva as pernas da transferência junto", async () => {
    await add({ accountId: liv, type: "CARD", points: 1000 });
    await c.call(transfers.POST, "POST", "/t", { fromAccountId: liv, toAccountId: lat, points: 500, bonusPercent: 10, occurredAt: "2026-10-22" });
    const out = await prisma.entry.findFirstOrThrow({ where: { type: "TRANSFER_OUT" } });
    const r = await c.call(bulkDelete.POST, "POST", "/d", { ids: [out.id] });
    expect(r.data.deleted).toBe(3);
    expect(await prisma.entry.count()).toBe(1);
    await assertConsistent();
  });
});

describe("relatórios", () => {
  it("transferência não conta como acúmulo nem duplica custo", async () => {
    await add({ accountId: liv, type: "PURCHASE", points: 10000, costCents: 30000 });
    await c.call(transfers.POST, "POST", "/t", { fromAccountId: liv, toAccountId: lat, points: 10000, bonusPercent: 20, occurredAt: "2026-10-22" });
    const r = await c.call(reports.GET, "GET", "/api/reports");
    const pts = r.data.byCategory.reduce((s: number, x: any) => s + x.points, 0);
    const cost = r.data.byCategory.reduce((s: number, x: any) => s + x.costCents, 0);
    expect(pts).toBe(12000); // 10.000 comprados + 2.000 de bônus
    expect(cost).toBe(30000);
  });
});

describe("evolução por titular", () => {
  it("série começa no início do período e termina hoje, mesmo com uma data só", async () => {
    await add({ accountId: liv, type: "CARD", points: 1000, occurredAt: new Date().toISOString().slice(0, 10) });
    const user = await prisma.user.findFirstOrThrow();
    const from = new Date(Date.now() - 90 * 86400_000);
    const evo = await evolutionByHolder(user.id, { from });
    expect(evo.points.length).toBeGreaterThanOrEqual(2);
    expect(evo.points[0]!.date).toBe(from.toISOString().slice(0, 10));
    const holderId = evo.holders[0]!.id;
    expect(evo.points[0]![holderId]).toBe(0);
    expect(evo.points[evo.points.length - 1]![holderId]).toBe(1000);
  });
});

describe("alertas", () => {
  it("alerta de saldo mínimo gera notificação uma vez", async () => {
    await add({ accountId: liv, type: "CARD", points: 1000 });
    expect((await c.call(alerts.POST, "POST", "/api/alerts", { type: "MIN_BALANCE", accountId: liv, threshold: 500 })).status).toBe(201);
    await add({ accountId: liv, type: "OTHER_DEBIT", points: 600, occurredAt: "2026-10-22" });
    await add({ accountId: liv, type: "OTHER_DEBIT", points: 100, occurredAt: "2026-10-23" });
    const n = await c.call(notifications.GET, "GET", "/api/notifications");
    expect(n.data.unread).toBe(1);
  });
});

describe("cadastro do titular", () => {
  it("salva nascimento, documentos, endereço, atributos e observações; valida e isola", async () => {
    const h = (await prisma.holder.findFirstOrThrow({ where: { name: "Ana" } })).id;
    const r = await c.call(holderRoute.PATCH, "PATCH", `/api/holders/${h}`, {
      name: "Ana Souza",
      birthDate: "1990-05-20",
      documents: [{ type: "CPF", number: "000.000.000-00" }],
      address: "Rua Exemplo, 1",
      attributes: [{ key: "Nº fidelidade", value: "ABC" }],
      notes: "teste",
    }, { id: h });
    expect(r.status).toBe(200);
    const saved = await prisma.holder.findUniqueOrThrow({ where: { id: h } });
    expect(saved).toMatchObject({ name: "Ana Souza", address: "Rua Exemplo, 1", notes: "teste", active: true });
    expect(saved.birthDate?.toISOString().slice(0, 10)).toBe("1990-05-20");
    expect(saved.attributes).toEqual([{ key: "Nº fidelidade", value: "ABC" }]);
    // só o nome: os demais campos não são apagados
    await c.call(holderRoute.PATCH, "PATCH", `/api/holders/${h}`, { name: "Ana Souza", active: false }, { id: h });
    expect(await prisma.holder.findUniqueOrThrow({ where: { id: h } })).toMatchObject({ active: false, address: "Rua Exemplo, 1" });
    // validações
    expect((await c.call(holderRoute.PATCH, "PATCH", `/api/holders/${h}`, { name: "Ana", documents: [{ type: "SENHA", number: "x" }] }, { id: h })).status).toBe(400);
    expect((await c.call(holderRoute.PATCH, "PATCH", `/api/holders/${h}`, { name: "Ana", birthDate: "2999-01-01" }, { id: h })).status).toBe(400);
    // outro usuário não edita
    const other = new Client();
    await other.call(register.POST, "POST", "/api/auth/register", { name: "Bia", email: "bia@x.test", password: "senha-forte-2" });
    expect((await other.call(holderRoute.PATCH, "PATCH", `/api/holders/${h}`, { name: "Invasão" }, { id: h })).status).toBe(404);
  });
});

describe("titular: e-mail autorizado, endereço e anexos", () => {
  const send = async (who: Client, holderId: string, name: string, body: Buffer) => {
    const { POST } = await import("@/app/api/holders/[id]/attachments/route");
    return POST(new Request(`http://localhost:3100/api/holders/${holderId}/attachments`, { method: "POST", headers: { cookie: who.cookie, "x-file-name": encodeURIComponent(name) }, body: new Uint8Array(body) }), { params: Promise.resolve({ id: holderId }) });
  };
  const PDF = Buffer.from("%PDF-1.4\n% sintético\n");

  it("salva e-mail e endereço em campos; formata o endereço", async () => {
    const h = (await prisma.holder.findFirstOrThrow({ where: { name: "Ana" } })).id;
    const r = await c.call(holderRoute.PATCH, "PATCH", `/api/holders/${h}`, { name: "Ana", accessEmail: "Ana@Exemplo.test", addressParts: { cep: "01001-000", logradouro: "Praça da Sé", numero: "1", cidade: "São Paulo", uf: "SP" } }, { id: h });
    expect(r.status).toBe(200);
    expect(await prisma.holder.findUniqueOrThrow({ where: { id: h } })).toMatchObject({ accessEmail: "ana@exemplo.test", address: "Praça da Sé, 1 – São Paulo/SP – CEP 01001-000" });
    expect((await c.call(holderRoute.PATCH, "PATCH", `/api/holders/${h}`, { name: "Ana", accessEmail: "não é e-mail" }, { id: h })).status).toBe(400);
    expect((await c.call(holderRoute.PATCH, "PATCH", `/api/holders/${h}`, { name: "Ana", addressParts: { uf: "XX1" } }, { id: h })).status).toBe(400);
  });

  it("anexos: tipo pelo conteúdo, limite, download e isolamento", async () => {
    const h = (await prisma.holder.findFirstOrThrow({ where: { name: "Ana" } })).id;
    const ok = await send(c, h, "../../contrato.pdf", PDF);
    expect(ok.status).toBe(201);
    const item = (await ok.json()).item;
    expect(item).toMatchObject({ name: ".._.._contrato.pdf", mime: "application/pdf" });
    expect((await send(c, h, "virus.pdf", Buffer.from("MZ executável"))).status).toBe(415);
    const { GET } = await import("@/app/api/holders/[id]/attachments/[aid]/route");
    const dl = await GET(new Request(`http://localhost:3100/x`, { headers: { cookie: c.cookie } }), { params: Promise.resolve({ id: h, aid: item.id }) });
    expect(dl.status).toBe(200);
    expect(dl.headers.get("content-disposition")).toContain("attachment");
    expect(Buffer.from(await dl.arrayBuffer()).equals(PDF)).toBe(true);
    const other = new Client();
    await other.call(register.POST, "POST", "/api/auth/register", { name: "Bia", email: "bia@x.test", password: "senha-forte-2" });
    expect((await send(other, h, "x.pdf", PDF)).status).toBe(404);
    expect((await GET(new Request(`http://localhost:3100/x`, { headers: { cookie: other.cookie } }), { params: Promise.resolve({ id: h, aid: item.id }) })).status).toBe(404);
    for (let i = 0; i < 9; i++) expect((await send(c, h, `f${i}.pdf`, PDF)).status).toBe(201);
    expect((await send(c, h, "11.pdf", PDF)).status).toBe(409);
  });
});

describe("compra parcelada com antecipação", () => {
  it("crédito e carrinho gravam o custo pago e o detalhe do parcelamento", async () => {
    const payment = { installments: 12, anticipated: true, nominalCents: 308000, paidCents: 294249, discountCents: 13751 };
    const r = await add({ accountId: liv, type: "PURCHASE", points: 100000, costs: [{ type: "PONTOS", amountCents: 294249 }], details: { payment }, idempotencyKey: randomUUID() });
    expect(r.status).toBe(201);
    const e = await prisma.entry.findFirstOrThrow({ where: { accountId: liv, type: "PURCHASE" } });
    expect(e.costCents).toBe(294249);
    expect((e.details as { payment: unknown }).payment).toEqual(payment);
    const t = await c.call(transfers.POST, "POST", "/api/transfers", { fromAccountId: liv, toAccountId: lat, points: 10000, bonusPercent: 0, occurredAt: "2026-10-22", idempotencyKey: randomUUID(), purchase: { points: 5000, priceCents: 14000, payment: { ...payment, nominalCents: 15000, paidCents: 14000, discountCents: 1000 } } });
    expect(t.status).toBe(201);
    const cart = await prisma.entry.findFirstOrThrow({ where: { accountId: liv, description: { startsWith: "Compra de pontos para transferência" } } });
    expect(cart.costCents).toBe(14000);
    expect((cart.details as { payment: { paidCents: number } }).payment.paidCents).toBe(14000);
    await assertConsistent();
  });

  it("editar: grava o parcelamento num lançamento antigo e depois volta para à vista", async () => {
    const r = await add({ accountId: lat, type: "PURCHASE", points: 85000, costs: [{ type: "PONTOS", amountCents: 261800 }], idempotencyKey: randomUUID() });
    const id = r.data.item.id as string;
    const payment = { installments: 12, anticipated: true, nominalCents: 261800, paidCents: 250000, discountCents: 11800 };
    const p = await c.call(entry.PATCH, "PATCH", "/x", { costs: [{ type: "PONTOS", amountCents: 250000 }], payment }, { id });
    expect(p.status).toBe(200);
    let e = await prisma.entry.findUniqueOrThrow({ where: { id } });
    expect(e.costCents).toBe(250000);
    expect((e.details as { payment: unknown }).payment).toEqual(payment);
    await c.call(entry.PATCH, "PATCH", "/x", { costs: [{ type: "PONTOS", amountCents: 261800 }], payment: null }, { id });
    e = await prisma.entry.findUniqueOrThrow({ where: { id } });
    expect(e.costCents).toBe(261800);
    expect((e.details as { payment?: unknown } | null)?.payment).toBeUndefined();
    await assertConsistent();
  });
});

describe("editar transferência", () => {
  it("carrega no formato do formulário e regrava no mesmo grupo e horário", async () => {
    await add({ accountId: liv, type: "PURCHASE", points: 30000, costs: [{ type: "PONTOS", amountCents: 90000 }], idempotencyKey: randomUUID() });
    const t = await c.call(transfers.POST, "POST", "/api/transfers", { fromAccountId: liv, toAccountId: lat, points: 10000, bonusPercent: 30, occurredAt: "2026-10-22", idempotencyKey: randomUUID(), purchase: { points: 5000, priceCents: 14000 } });
    const groupId = t.data.groupId as string;
    const outBefore = await prisma.entry.findFirstOrThrow({ where: { groupId, type: "TRANSFER_OUT" } });
    const g = await c.call(transferRoute.GET, "GET", "/x", undefined, { groupId });
    expect(g.data.item).toMatchObject({ fromAccountId: liv, toAccountId: lat, points: 10000, bonusPercent: 30, occurredAt: "2026-10-22", description: "", parityFrom: 1, parityTo: 1, feeCents: 0, deliveryDate: null, purchase: { points: 5000, priceCents: 14000, applyAll: false } });
    const p = await c.call(transferRoute.PATCH, "PATCH", "/x", { fromAccountId: liv, toAccountId: lat, points: 20000, bonusPercent: 80, occurredAt: "2026-10-22", parityFrom: 1, parityTo: 1 }, { groupId });
    expect(p.status).toBe(200);
    const legs = await prisma.entry.findMany({ where: { groupId } });
    expect(legs.map((e) => [e.type, e.points]).sort()).toEqual([["TRANSFER_BONUS", 16000], ["TRANSFER_IN", 20000], ["TRANSFER_OUT", -20000]]);
    const out = legs.find((e) => e.type === "TRANSFER_OUT")!;
    expect(out.createdAt.getTime()).toBe(outBefore.createdAt.getTime());
    expect(out.idempotencyKey).toBe(outBefore.idempotencyKey);
    expect((await prisma.account.findUniqueOrThrow({ where: { id: lat } })).balance).toBe(36000);
    await assertConsistent();
  });

  it("edição inválida não muda nada", async () => {
    await add({ accountId: liv, type: "PURCHASE", points: 30000, costs: [{ type: "PONTOS", amountCents: 90000 }], idempotencyKey: randomUUID() });
    const t = await c.call(transfers.POST, "POST", "/api/transfers", { fromAccountId: liv, toAccountId: lat, points: 10000, bonusPercent: 0, occurredAt: "2026-10-22", idempotencyKey: randomUUID() });
    const groupId = t.data.groupId as string;
    const bad = await c.call(transferRoute.PATCH, "PATCH", "/x", { fromAccountId: liv, toAccountId: liv, points: 10000, bonusPercent: 0, occurredAt: "2026-10-22" }, { groupId });
    expect(bad.status).toBe(400);
    expect(await prisma.entry.count({ where: { groupId } })).toBe(2);
  });
});
