// Novo lançamento: custos detalhados, transferência avançada e repetição automática.
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, Client, seedPrograms } from "./helpers";
import * as register from "@/app/api/auth/register/route";
import * as holders from "@/app/api/holders/route";
import * as accounts from "@/app/api/accounts/route";
import * as entries from "@/app/api/entries/route";
import * as entry from "@/app/api/entries/[id]/route";
import * as transfers from "@/app/api/transfers/route";
import { prisma } from "@/server/db";
import { addPeriod, skipWeekend, processDueRecurrences } from "@/server/services/accounts";

let c: Client;
let liv: string;
let lat: string;
let userId: string;

beforeEach(async () => {
  await resetDb();
  const p = await seedPrograms();
  c = new Client();
  await c.call(register.POST, "POST", "/api/auth/register", { name: "Ana", email: "ana@x.test", password: "senha-forte-1" });
  userId = (await prisma.user.findUniqueOrThrow({ where: { email: "ana@x.test" } })).id;
  const h = await c.call(holders.POST, "POST", "/api/holders", { name: "Ana" });
  liv = (await c.call(accounts.POST, "POST", "/api/accounts", { holderId: h.data.item.id, programId: p.livelo.id })).data.item.id;
  lat = (await c.call(accounts.POST, "POST", "/api/accounts", { holderId: h.data.item.id, programId: p.latam.id })).data.item.id;
});

const add = (body: Record<string, unknown>) => c.call(entries.POST, "POST", "/api/entries", { occurredAt: "2026-10-01", ...body });
const transfer = (body: Record<string, unknown>) => c.call(transfers.POST, "POST", "/api/transfers", { fromAccountId: liv, toAccountId: lat, bonusPercent: 0, occurredAt: "2026-10-02", ...body });
const acc = (id: string) => prisma.account.findUniqueOrThrow({ where: { id } });
const card = (owner: string) => prisma.creditCard.create({ data: { userId: owner, accountId: liv, name: "Cartão", pointsPerDollar: 220, closingDay: 1, dueDay: 10 } });
const isoIn = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

describe("custos do crédito", () => {
  it("o custo é a soma dos itens e cada item fica guardado", async () => {
    const own = await card(userId);
    const r = await add({ accountId: liv, type: "PURCHASE", points: 10000, costs: [{ type: "PONTOS", amountCents: 30000, cardId: own.id }, { type: "IOF", amountCents: 1000 }] });
    expect(r.status).toBe(201);
    expect(r.data.item.inputCostCents).toBe(31000);
    expect(await acc(liv)).toMatchObject({ balance: 10000, costCents: 31000 });
    const rows = await prisma.entryCost.findMany({ where: { entryId: r.data.item.id }, orderBy: { amountCents: "desc" } });
    expect(rows.map((x) => [x.type, x.amountCents, x.cardId])).toEqual([["PONTOS", 30000, own.id], ["IOF", 1000, null]]);
  });

  it("recusa tipo de custo que não pertence à categoria", async () => {
    const r = await add({ accountId: liv, type: "PURCHASE", points: 1000, costs: [{ type: "MENSALIDADE", amountCents: 100 }] });
    expect(r.status).toBe(400);
    expect(await prisma.entry.count()).toBe(0);
  });

  it("recusa cartão de outro usuário", async () => {
    const other = new Client();
    await other.call(register.POST, "POST", "/api/auth/register", { name: "Bia", email: "bia@x.test", password: "senha-forte-2" });
    const bia = await prisma.user.findUniqueOrThrow({ where: { email: "bia@x.test" } });
    const foreign = await card(bia.id);
    const r = await add({ accountId: liv, type: "PURCHASE", points: 1000, costs: [{ type: "PONTOS", amountCents: 100, cardId: foreign.id }] });
    expect(r.status).toBe(404);
    expect(await prisma.entry.count()).toBe(0);
  });

  it("débito de emissão guarda custos e detalhes da viagem", async () => {
    await add({ accountId: lat, type: "PURCHASE", points: 20000, costs: [{ type: "PONTOS", amountCents: 50000 }] });
    const r = await add({
      accountId: lat, type: "FLIGHT_REDEMPTION", points: 15000, occurredAt: "2026-10-05",
      costs: [{ type: "TAXA_EMBARQUE", amountCents: 8990 }],
      details: { cashReferenceCents: 120000, passengers: 2, reservation: "ABC123", origin: "GRU", destination: "LIS", startDate: "2026-12-01", endDate: "2026-12-15" },
    });
    expect(r.status).toBe(201);
    const e = await prisma.entry.findUniqueOrThrow({ where: { id: r.data.item.id }, include: { costs: true } });
    expect(e.details).toMatchObject({ origin: "GRU", destination: "LIS", passengers: 2 });
    expect(e.costs).toHaveLength(1);
    // O resgate continua tirando custo médio da conta (taxa não entra no CPM)
    expect(await acc(lat)).toMatchObject({ balance: 5000, costCents: 12500 });
    expect((await add({ accountId: lat, type: "FLIGHT_REDEMPTION", points: 1, details: { origin: "gru" } })).status).toBe(400);
  });
});

describe("transferência avançada", () => {
  beforeEach(async () => {
    await add({ accountId: liv, type: "PURCHASE", points: 10000, costs: [{ type: "PONTOS", amountCents: 30000 }] });
  });

  it("paridade 3:2, bônus e taxas adicionais", async () => {
    const r = await transfer({ points: 6000, bonusPercent: 50, parityFrom: 3, parityTo: 2, feeCents: 1000 });
    expect(r.status).toBe(201);
    // 6000 → 4000 base + 2000 bônus; custo levado 18000 + taxa 1000
    expect(await acc(lat)).toMatchObject({ balance: 6000, costCents: 19000 });
    expect(await acc(liv)).toMatchObject({ balance: 4000, costCents: 12000 });
  });

  it("compra no carrinho aplicada inteira na transferência", async () => {
    const r = await transfer({ points: 10000, purchase: { points: 5000, priceCents: 25000, applyAll: true } });
    expect(r.status).toBe(201);
    // Origem: 15000 pts / R$ 550; sai a compra (R$ 250) + 5000 pts do custo antigo (R$ 150)
    expect(await acc(lat)).toMatchObject({ balance: 10000, costCents: 40000 });
    expect(await acc(liv)).toMatchObject({ balance: 5000, costCents: 15000 });
    expect(await prisma.entry.count({ where: { accountId: liv, type: "PURCHASE" } })).toBe(2);
  });

  it("compra no carrinho sem prioridade usa o custo médio", async () => {
    await transfer({ points: 10000, purchase: { points: 5000, priceCents: 25000, applyAll: false } });
    expect(await acc(lat)).toMatchObject({ balance: 10000, costCents: 36667 }); // 55000 × 10000 / 15000
  });

  it("entrega futura fica a receber e a confirmação libera o grupo", async () => {
    const r = await transfer({ points: 4000, bonusPercent: 10, deliveryDate: isoIn(20) });
    expect(r.status).toBe(201);
    expect(await acc(lat)).toMatchObject({ balance: 0, costCents: 0 });
    expect(await acc(liv)).toMatchObject({ balance: 6000, costCents: 18000 });
    const legIn = await prisma.entry.findFirstOrThrow({ where: { accountId: lat, type: "TRANSFER_IN" } });
    expect(legIn.status).toBe("PENDING");
    const ok = await c.call(entry.PATCH, "PATCH", `/api/entries/${legIn.id}`, { status: "CONFIRMED" }, { id: legIn.id });
    expect(ok.status).toBe(200);
    expect(await acc(lat)).toMatchObject({ balance: 4400, costCents: 12000 });
    expect(await prisma.entry.count({ where: { status: "PENDING" } })).toBe(0);
  });

  it("valida paridade e compra maior que a transferência", async () => {
    expect((await transfer({ points: 1, parityFrom: 3, parityTo: 1 })).status).toBe(400);
    expect((await transfer({ points: 1000, purchase: { points: 2000, priceCents: 100, applyAll: true } })).status).toBe(400);
    expect((await transfer({ points: 1000, parityFrom: 0 })).status).toBe(400);
    expect(await acc(lat)).toMatchObject({ balance: 0 });
  });
});

describe("repetição automática", () => {
  it("calcula as próximas datas", () => {
    const d = (s: string) => new Date(`${s}T00:00:00Z`);
    const iso = (x: Date) => x.toISOString().slice(0, 10);
    expect(iso(addPeriod(d("2026-10-01"), "DAILY", 3))).toBe("2026-10-04");
    expect(iso(addPeriod(d("2026-10-01"), "WEEKLY", 2))).toBe("2026-10-15");
    expect(iso(addPeriod(d("2026-01-10"), "MONTHLY", 1, 31))).toBe("2026-02-28");
    expect(iso(addPeriod(d("2026-01-31"), "MONTHLY", 2))).toBe("2026-03-31");
    expect(iso(addPeriod(d("2026-03-15"), "YEARLY"))).toBe("2027-03-15");
    expect(iso(skipWeekend(d("2026-10-24")))).toBe("2026-10-26"); // sábado → segunda
    expect(iso(skipWeekend(d("2026-10-25")))).toBe("2026-10-26"); // domingo → segunda
    expect(iso(skipWeekend(d("2026-10-23")))).toBe("2026-10-23");
  });

  it("crédito de clube com repetição cria a recorrência a partir da próxima data", async () => {
    const r = await add({ accountId: liv, type: "CLUB", points: 1000, costs: [{ type: "MENSALIDADE", amountCents: 4990 }], recurrence: { frequency: "WEEKLY", interval: 2 } });
    expect(r.status).toBe(201);
    const rec = await prisma.recurrence.findFirstOrThrow({ where: { userId } });
    expect(rec).toMatchObject({ frequency: "WEEKLY", interval: 2, points: 1000, costCents: 4990, active: true });
    expect(rec.nextDate.toISOString().slice(0, 10)).toBe("2026-10-15");
    expect((await add({ accountId: liv, type: "PURCHASE", points: 1, recurrence: { frequency: "MONTHLY" } })).status).toBe(400);
  });

  it("respeita data de término e pula finais de semana", async () => {
    // Sábado 03/01; semanal até 31/01: ocorrências 10, 17, 24 e 31 (sábados) caem nas segundas seguintes
    await add({ accountId: liv, type: "CLUB", points: 100, occurredAt: "2026-01-03", recurrence: { frequency: "WEEKLY", endDate: "2026-01-31", skipWeekends: true } });
    await processDueRecurrences(userId);
    const made = await prisma.entry.findMany({ where: { accountId: liv }, orderBy: { occurredAt: "asc" } });
    expect(made.map((e) => e.occurredAt.toISOString().slice(0, 10))).toEqual(["2026-01-03", "2026-01-12", "2026-01-19", "2026-01-26", "2026-02-02"]);
    expect((await prisma.recurrence.findFirstOrThrow({ where: { userId } })).active).toBe(false);
    await processDueRecurrences(userId); // idempotente
    expect(await prisma.entry.count({ where: { accountId: liv } })).toBe(5);
  });
});

describe("extrato: filtros, detalhes e edição de custos", () => {
  it("filtra por conta, cartão e faixas de pontos e custo (em valor absoluto)", async () => {
    const own = await card(userId);
    await add({ accountId: liv, type: "PURCHASE", points: 10000, costs: [{ type: "PONTOS", amountCents: 30000, cardId: own.id }] });
    await add({ accountId: liv, type: "CLUB", points: 1000, costs: [{ type: "MENSALIDADE", amountCents: 4990 }] });
    await add({ accountId: liv, type: "EXPIRATION", points: 6000, occurredAt: "2026-10-02" });
    await add({ accountId: lat, type: "INITIAL_BALANCE", points: 500 });
    const list = async (qs: string) => (await c.call(entries.GET, "GET", `/api/entries?${qs}`)).data.items.map((e: { description: string; points: number }) => e.points).sort((a: number, b: number) => a - b);
    expect(await list(`accountId=${lat}`)).toEqual([500]);
    expect(await list(`cardId=${own.id}`)).toEqual([10000]);
    expect(await list("minPoints=5000")).toEqual([-6000, 10000]);
    expect(await list("minPoints=900&maxPoints=1000")).toEqual([1000]);
    expect(await list("minCost=10000")).toEqual([-6000, 10000]); // a expiração tira R$ 109,76 de custo médio
    expect(await list("maxCost=5000&minCost=1")).toEqual([1000]);
    expect((await c.call(entries.GET, "GET", "/api/entries?maxPoints=99999999999")).status).toBe(400);
  });

  it("detalhes trazem custos com o cartão e as outras partes da transferência", async () => {
    const own = await card(userId);
    const r = await add({ accountId: liv, type: "PURCHASE", points: 10000, costs: [{ type: "PONTOS", amountCents: 30000, cardId: own.id }, { type: "IOF", amountCents: 1000 }] });
    const d = await c.call(entry.GET, "GET", `/api/entries/${r.data.item.id}`, undefined, { id: r.data.item.id });
    expect(d.status).toBe(200);
    expect(d.data.entry.costs.map((x: { type: string; card: { name: string } | null }) => [x.type, x.card?.name ?? null]).sort()).toEqual([["IOF", null], ["PONTOS", "Cartão"]]);
    await transfer({ points: 1000, bonusPercent: 10 });
    const out = await prisma.entry.findFirstOrThrow({ where: { type: "TRANSFER_OUT" } });
    const t = await c.call(entry.GET, "GET", `/api/entries/${out.id}`, undefined, { id: out.id });
    expect(t.data.legs.map((l: { type: string }) => l.type).sort()).toEqual(["TRANSFER_BONUS", "TRANSFER_IN"]);
    // de outro usuário: 404
    const other = new Client();
    await other.call(register.POST, "POST", "/api/auth/register", { name: "Bia", email: "bia@x.test", password: "senha-forte-2" });
    expect((await other.call(entry.GET, "GET", `/api/entries/${out.id}`, undefined, { id: out.id })).status).toBe(404);
  });

  it("editar substitui os custos e recalcula o custo da conta", async () => {
    const r = await add({ accountId: liv, type: "PURCHASE", points: 10000, costs: [{ type: "PONTOS", amountCents: 30000 }] });
    const id = r.data.item.id;
    const p = await c.call(entry.PATCH, "PATCH", `/api/entries/${id}`, { costs: [{ type: "PONTOS", amountCents: 25000 }, { type: "IOF", amountCents: 500 }] }, { id });
    expect(p.status).toBe(200);
    expect(await acc(liv)).toMatchObject({ balance: 10000, costCents: 25500 });
    expect(await prisma.entryCost.count({ where: { entryId: id } })).toBe(2);
    expect((await c.call(entry.PATCH, "PATCH", `/api/entries/${id}`, { costs: [{ type: "MENSALIDADE", amountCents: 1 }] }, { id })).status).toBe(400);
    expect(await acc(liv)).toMatchObject({ costCents: 25500 });
  });
});
