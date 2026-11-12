// Metas e comissões: o cálculo (regras, rateio entre emissores, faixas retroativas, períodos), o extrato de membros
// e parceiros (comissão calculada, bônus, ajustes e pagamentos), o pagamento que vira despesa no Financeiro, a
// visão geral, a venda creditada a quem a lança, e as permissões (área "Metas e comissões"), isolado por conta.
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, Client, seedPrograms } from "./helpers";
import { prisma } from "@/server/db";
import { brDay } from "@/domain/brasilia";
import {
  statsFor, commissionFor, effectiveValue, periodsUntil, periodLabel, describeRule, type SaleLite,
} from "@/domain/commissions";
import { apiRequirement, pageRequirement, rolePermissions } from "@/domain/permissions";
import { statement } from "@/server/services/commissions";
import { listGoals } from "@/server/services/team";
import * as register from "@/app/api/auth/register/route";
import * as holders from "@/app/api/holders/route";
import * as accounts from "@/app/api/accounts/route";
import * as entries from "@/app/api/entries/route";
import * as sales from "@/app/api/sales/route";
import * as issuersRoute from "@/app/api/sales/[id]/issuers/route";
import * as partners from "@/app/api/partners/route";
import * as salePartner from "@/app/api/sales/[id]/partner/route";
import * as members from "@/app/api/team/members/route";
import * as inviteRoute from "@/app/api/team/members/[id]/invite/route";
import * as acceptRoute from "@/app/api/auth/invite/[token]/route";
import * as finAccounts from "@/app/api/finance/accounts/route";
import * as overviewRoute from "@/app/api/commissions/route";
import * as rulesRoute from "@/app/api/commissions/rules/route";
import * as ruleRoute from "@/app/api/commissions/rules/[id]/route";
import * as statementRoute from "@/app/api/commissions/statement/route";
import * as entriesRoute from "@/app/api/commissions/entries/route";
import * as entryRoute from "@/app/api/commissions/entries/[id]/route";
import * as payRoute from "@/app/api/commissions/pay/route";
import * as goals from "@/app/api/goals/route";

const sale = (o: Partial<SaleLite>): SaleLite => ({ occurredAt: "2026-11-05", issuerIds: [], totalCents: 0, resultCents: 0, points: 0, refunded: false, ...o });
const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe("cálculo da comissão", () => {
  const vendas = [
    sale({ issuerIds: ["bia", "caio"], totalCents: 100_000, resultCents: 20_000, points: 40_000 }),
    sale({ issuerIds: ["bia"], totalCents: 50_000, resultCents: -5_000, points: 10_000 }),
    sale({ issuerIds: ["bia"], totalCents: 999_999, resultCents: 999_999, points: 999_999, refunded: true }), // reembolsada não conta
    sale({ issuerIds: [], totalCents: 30_000, resultCents: 6_000, points: 8_000 }), // sem emissor: só na base da agência
  ];

  it("vendas que emitiu (a parte dele, rateada) ou as da agência toda", () => {
    expect(statsFor(vendas, "bia", "INDIVIDUAL")).toEqual({ revenue: 100_000, profit: 5_000, sales: 1.5, miles: 30_000 });
    expect(statsFor(vendas, "caio", "INDIVIDUAL")).toEqual({ revenue: 50_000, profit: 10_000, sales: 0.5, miles: 20_000 });
    expect(statsFor(vendas, "ze", "INDIVIDUAL")).toEqual({ revenue: 0, profit: 0, sales: 0, miles: 0 });
    expect(statsFor(vendas, "ze", "TEAM")).toEqual({ revenue: 180_000, profit: 21_000, sales: 3, miles: 58_000 });
  });

  it("% do faturamento, % do lucro (negativo = 0), R$ por venda e R$ por mil milhas", () => {
    const bia = statsFor(vendas, "bia", "INDIVIDUAL");
    expect(commissionFor({ kind: "SALE_PCT", value: 500, tiers: [] }, bia)).toBe(5_000); // 5% de R$ 1.000
    expect(commissionFor({ kind: "PROFIT_PCT", value: 1000, tiers: [] }, bia)).toBe(500); // 10% de R$ 50
    expect(commissionFor({ kind: "PROFIT_PCT", value: 1000, tiers: [] }, { revenue: 1, profit: -9_000, sales: 1, miles: 1 })).toBe(0);
    expect(commissionFor({ kind: "FIXED", value: 1_000, tiers: [] }, bia)).toBe(1_500); // R$ 10 × 1,5 venda
    expect(commissionFor({ kind: "PER_K_MILES", value: 300, tiers: [] }, bia)).toBe(9_000); // R$ 3 × 30 mil milhas
  });

  it("faixas retroativas: a maior faixa atingida vale para o período todo", () => {
    const rule = { kind: "PROFIT_PCT" as const, value: 500, tiers: [{ min: 5_000_000, value: 700 }, { min: 10_000_000, value: 1000 }] };
    const at = (profit: number) => ({ revenue: 0, profit, sales: 0, miles: 0 });
    expect(effectiveValue(rule, at(4_999_999))).toBe(500);
    expect(commissionFor(rule, at(4_000_000))).toBe(200_000); // 5% de R$ 40 mil
    expect(commissionFor(rule, at(6_000_000))).toBe(420_000); // 7% sobre os R$ 60 mil todos
    expect(commissionFor(rule, at(12_000_000))).toBe(1_200_000); // 10%
    expect(commissionFor({ kind: "FIXED", value: 1_000, tiers: [{ min: 10, value: 1_500 }] }, { revenue: 0, profit: 0, sales: 12, miles: 0 })).toBe(18_000);
  });

  it("períodos da regra até hoje, rótulos e descrição", () => {
    expect(periodsUntil("MONTH", d("2026-09-15"), d("2026-11-12")).map((p) => periodLabel("MONTH", p))).toEqual(["set/2026", "out/2026", "nov/2026"]);
    expect(periodsUntil("QUARTER", d("2026-08-01"), d("2026-11-12")).map((p) => periodLabel("QUARTER", p))).toEqual(["3º tri/2026", "4º tri/2026"]);
    expect(periodsUntil("MONTH", d("2026-12-01"), d("2026-11-12"))).toEqual([]);
    expect(describeRule({ kind: "PROFIT_PCT", value: 550, base: "INDIVIDUAL", tiers: [{ min: 1, value: 700 }], period: "MONTH" })).toBe("5,5% do lucro · vendas que emitiu · mensal · 1 faixa");
    expect(describeRule({ kind: "FIXED", value: 2_000, base: "TEAM", tiers: [], period: "QUARTER" }).replace(/\s/g, " ")).toBe("R$ 20,00 por venda · vendas da agência · trimestral");
  });
});

describe("permissões de Metas e comissões", () => {
  it("área própria: metas, regras, extrato e pagamentos; Financeiro edita, Emissor e Atendimento não veem", () => {
    expect(apiRequirement("/api/commissions", "GET")).toEqual({ area: "metas", level: "view" });
    expect(apiRequirement("/api/commissions/pay", "POST")).toEqual({ area: "metas", level: "edit" });
    expect(apiRequirement("/api/goals/abc", "PUT")).toEqual({ area: "metas", level: "edit" });
    expect(apiRequirement("/api/key-results/abc", "POST")).toEqual({ area: "metas", level: "edit" });
    expect(pageRequirement("/app/equipe/metas")).toEqual({ area: "metas", level: "view" });
    expect(pageRequirement("/app/equipe/tarefas")).toEqual({ area: "tarefas", level: "view" });
    expect(rolePermissions("FINANCEIRO")).toContain("metas:edit");
    expect(rolePermissions("ADMIN")).toContain("metas:edit");
    for (const r of ["EMISSOR", "ATENDIMENTO", "CONTADOR"] as const) expect(rolePermissions(r).some((p) => p.startsWith("metas:"))).toBe(false);
  });
});

/* ---------------- Serviço e rotas ---------------- */

let c: Client, o: Client, userId: string, acc: string;
const month = brDay().slice(0, 7);
const day1 = `${month}-01`;

async function newSale(totalCents: number, points = 10_000) {
  const r = await c.call(sales.POST, "POST", "/s", { origin: "OWN", accountId: acc, occurredAt: day1, items: [{ kind: "FLIGHT", issuedWith: "POINTS", points, salePriceCents: totalCents, passengers: 1 }] });
  expect(r.status).toBe(201);
  return r.data.sale?.id ?? r.data.item?.id ?? r.data.id;
}
async function join(memberId: string, role: string, permissions?: string[]) {
  const inv = await c.call(inviteRoute.POST, "POST", `/api/team/members/${memberId}/invite`, { role, permissions }, { id: memberId });
  expect(inv.status).toBe(201);
  const m = new Client();
  const r = await m.call(acceptRoute.POST, "POST", "/api/auth/invite/x", { name: "Membro", password: "senha-do-membro-1" }, { token: inv.data.item.link.split("/convite/")[1] });
  expect(r.status).toBe(201);
  return m;
}

beforeEach(async () => {
  await resetDb();
  await seedPrograms();
  c = new Client();
  userId = (await c.call(register.POST, "POST", "/r", { name: "Ana", email: "ana@x.test", password: "senha-forte-1" })).data.user.id;
  o = new Client();
  await o.call(register.POST, "POST", "/r", { name: "Outro", email: "o@x.test", password: "senha-forte-2" });
  const p = await prisma.program.findFirstOrThrow({ where: { code: "LATAM" } });
  const h = (await c.call(holders.POST, "POST", "/h", { name: "Ana" })).data.item.id;
  acc = (await c.call(accounts.POST, "POST", "/a", { holderId: h, programId: p.id })).data.item.id;
  await c.call(entries.POST, "POST", "/e", { accountId: acc, type: "PURCHASE", points: 100_000, occurredAt: day1, costs: [{ type: "PONTOS", amountCents: 250_000 }] });
});

describe("regras, extrato e pagamento", () => {
  it("comissão do mês por regra, bônus, ajuste, pagamento no Financeiro e saldo; isolado por conta", async () => {
    const bia = (await c.call(members.POST, "POST", "/m", { name: "Bia" })).data.id as string;
    const caio = (await c.call(members.POST, "POST", "/m", { name: "Caio" })).data.id as string;
    const a = await newSale(100_000), b = await newSale(40_000);
    expect((await c.call(issuersRoute.POST, "POST", "/i", { memberIds: [bia, caio] }, { id: a })).status).toBe(200);
    await c.call(issuersRoute.POST, "POST", "/i", { memberIds: [bia] }, { id: b });

    // validação
    expect((await c.call(rulesRoute.POST, "POST", "/r", { memberId: bia, kind: "SALE_PCT", value: 15_000, startsAt: day1 })).status).toBe(400); // 150%
    expect((await c.call(rulesRoute.POST, "POST", "/r", { memberId: bia, kind: "SALE_PCT", value: 500, startsAt: day1, tiers: [{ min: 1, value: 1 }, { min: 1, value: 2 }] })).status).toBe(400);
    expect((await o.call(rulesRoute.POST, "POST", "/r", { memberId: bia, kind: "SALE_PCT", value: 500, startsAt: day1 })).status).toBe(404); // membro de outra conta

    // Bia: 10% do faturamento das vendas que emitiu; Caio: R$ 10 por venda. O início vira o 1º dia do mês.
    const rb = await c.call(rulesRoute.POST, "POST", "/r", { memberId: bia, kind: "SALE_PCT", value: 1000, startsAt: `${month}-20` });
    expect(rb.status).toBe(201);
    await c.call(rulesRoute.POST, "POST", "/r", { memberId: caio, kind: "FIXED", value: 1_000, startsAt: day1 });
    const rules = (await c.call(rulesRoute.GET, "GET", "/r")).data.rules;
    expect(rules.map((r: any) => [r.member, r.kind, r.startsAt])).toEqual([["Bia", "SALE_PCT", day1], ["Caio", "FIXED", day1]]);
    expect((await o.call(rulesRoute.GET, "GET", "/r")).data.rules).toEqual([]);

    let ov = (await c.call(overviewRoute.GET, "GET", "/c")).data;
    const row = (id: string) => ov.team.find((t: any) => t.id === id);
    expect(row(bia)).toMatchObject({ monthCents: 9_000, dueCents: 9_000, rules: 1 }); // 10% de (R$ 500 + R$ 400)
    expect(row(caio)).toMatchObject({ monthCents: 500, dueCents: 500 }); // meia venda
    expect(ov.totals).toMatchObject({ achievedCents: 140_000, dueCents: 9_500, paidMonthCents: 0, goalCents: null });

    // meta de faturamento do mês aparece na visão geral
    await c.call(goals.POST, "POST", "/g", { title: "Faturar", period: "MONTH", start: day1, keyResults: [{ title: "R$ 2 mil", metric: "REVENUE", target: 200_000 }] });
    expect((await c.call(overviewRoute.GET, "GET", "/c")).data.totals.goalCents).toBe(200_000);

    // extrato da Bia: a comissão calculada; bônus e ajuste a menos
    const st = (q: string, cl = c) => cl.call(statementRoute.GET, "GET", `/api/commissions/statement?${q}`);
    expect((await st(`member=${bia}`)).data).toMatchObject({ earnedCents: 9_000, paidCents: 0, balanceCents: 9_000 });
    expect((await c.call(entriesRoute.POST, "POST", "/e", { memberId: bia, kind: "BONUS", amountCents: 2_000, date: day1, note: "Meta batida" })).status).toBe(201);
    expect((await c.call(entriesRoute.POST, "POST", "/e", { memberId: bia, kind: "ADJUST", amountCents: -500, date: day1 })).status).toBe(201);
    expect((await c.call(entriesRoute.POST, "POST", "/e", { memberId: bia, kind: "BONUS", amountCents: -100, date: day1 })).status).toBe(400); // bônus negativo
    expect((await c.call(entriesRoute.POST, "POST", "/e", { memberId: bia, partnerId: bia, kind: "BONUS", amountCents: 100, date: day1 })).status).toBe(400); // os dois
    expect((await st(`member=${bia}`)).data.balanceCents).toBe(10_500);

    // pagamento com conta: vira despesa paga em Pessoal › Comissões
    const conta = (await c.call(finAccounts.POST, "POST", "/f", { name: "Banco", kind: "BANK", initialCents: 0 })).data;
    const contaId = conta.item?.id ?? conta.id;
    expect(contaId).toBeTruthy();
    expect((await o.call(payRoute.POST, "POST", "/p", { memberId: bia, amountCents: 100, date: day1 })).status).toBe(404);
    expect((await c.call(payRoute.POST, "POST", "/p", { memberId: bia, amountCents: 0, date: day1 })).status).toBe(400);
    const pay = await c.call(payRoute.POST, "POST", "/p", { memberId: bia, amountCents: 10_000, date: day1, finAccountId: contaId, note: "Pix" });
    expect(pay.status).toBe(201);
    const fin = await prisma.finTransaction.findFirstOrThrow({ where: { userId, category: "Pessoal › Comissões" } });
    expect(fin).toMatchObject({ type: "EXPENSE", amountCents: 10_000, accountId: contaId, counterpart: "Bia" });
    expect(fin.paidAt).not.toBeNull();
    let s = (await st(`member=${bia}`)).data;
    expect(s).toMatchObject({ earnedCents: 10_500, paidCents: 10_000, balanceCents: 500 });
    expect(s.rows.map((r: any) => r.kind).sort()).toEqual(["ADJUST", "BONUS", "COMMISSION", "PAYMENT"]);
    ov = (await c.call(overviewRoute.GET, "GET", "/c")).data;
    expect(row(bia)).toMatchObject({ dueCents: 500, paidMonthCents: 10_000 });

    // outra conta não vê o extrato nem apaga o lançamento
    expect((await st(`member=${bia}`, o)).status).toBe(404);
    expect((await st("")).status).toBe(400);
    expect((await o.call(entryRoute.DELETE, "DELETE", "/x", undefined, { id: pay.data.id })).status).toBe(404);

    // apagar o pagamento leva a despesa junto
    expect((await c.call(entryRoute.DELETE, "DELETE", "/x", undefined, { id: pay.data.id })).status).toBe(200);
    expect(await prisma.finTransaction.count({ where: { userId } })).toBe(0);
    s = (await st(`member=${bia}`)).data;
    expect(s.balanceCents).toBe(10_500);

    // regra pausada não calcula; apagada sai do extrato (bônus e ajuste ficam)
    expect((await c.call(ruleRoute.PUT, "PUT", "/x", { memberId: bia, kind: "SALE_PCT", value: 1000, startsAt: day1, active: false }, { id: rb.data.id })).status).toBe(200);
    expect((await st(`member=${bia}`)).data.balanceCents).toBe(1_500);
    expect((await o.call(ruleRoute.DELETE, "DELETE", "/x", undefined, { id: rb.data.id })).status).toBe(404);
    expect((await c.call(ruleRoute.DELETE, "DELETE", "/x", undefined, { id: rb.data.id })).status).toBe(200);
    expect(await prisma.commissionRule.count({ where: { userId } })).toBe(1);
  });

  it("faixa no trimestre e regra começando em mês passado entram no extrato", async () => {
    const bia = (await c.call(members.POST, "POST", "/m", { name: "Bia" })).data.id as string;
    const a = await newSale(100_000);
    await c.call(issuersRoute.POST, "POST", "/i", { memberIds: [bia] }, { id: a });
    // R$ 10 por venda; a partir de 1 venda no trimestre, R$ 25
    await c.call(rulesRoute.POST, "POST", "/r", { memberId: bia, kind: "FIXED", value: 1_000, period: "QUARTER", startsAt: day1, tiers: [{ min: 1, value: 2_500 }] });
    const now = new Date(`${brDay()}T00:00:00Z`);
    const s = await statement(userId, { memberId: bia }, now);
    expect(s.rows.filter((r) => r.kind === "COMMISSION").map((r) => r.amountCents)).toEqual([2_500]);
    expect(s.rows[0]!.label).toMatch(/^Comissão \dº tri\/\d{4}$/);
  });

  it("parceiro: a comissão das vendas dele por mês, pagamento e saldo", async () => {
    const p = (await c.call(partners.POST, "POST", "/p", { name: "Indicador", mode: "FIXED", value: 2_000 })).data.id as string;
    const a = await newSale(100_000);
    expect((await c.call(salePartner.POST, "POST", "/x", { partnerId: p }, { id: a })).status).toBe(200);
    const st = await c.call(statementRoute.GET, "GET", `/api/commissions/statement?partner=${p}`);
    expect(st.data).toMatchObject({ earnedCents: 2_000, balanceCents: 2_000 });
    expect(st.data.rows[0]).toMatchObject({ kind: "COMMISSION", amountCents: 2_000 });
    expect((await c.call(payRoute.POST, "POST", "/p", { partnerId: p, amountCents: 2_000, date: day1 })).status).toBe(201);
    const ov = (await c.call(overviewRoute.GET, "GET", "/c")).data;
    expect(ov.partners[0]).toMatchObject({ name: "Indicador", monthSales: 1, monthRevenueCents: 100_000, monthCents: 2_000, dueCents: 0, paidMonthCents: 2_000 });
    expect(await prisma.finTransaction.count({ where: { userId } })).toBe(0); // sem conta: só no extrato
    expect((await o.call(statementRoute.GET, "GET", `/api/commissions/statement?partner=${p}`)).status).toBe(404);
  });
});

describe("metas por membro", () => {
  it("a meta com responsável mede só as vendas que ele emitiu (a parte dele); a da empresa, todas", async () => {
    const bia = (await c.call(members.POST, "POST", "/m", { name: "Bia" })).data.id as string;
    const caio = (await c.call(members.POST, "POST", "/m", { name: "Caio" })).data.id as string;
    const a = await newSale(100_000), b = await newSale(40_000);
    await c.call(issuersRoute.POST, "POST", "/i", { memberIds: [bia, caio] }, { id: a });
    await c.call(issuersRoute.POST, "POST", "/i", { memberIds: [bia] }, { id: b });
    const kr = [{ title: "Faturamento", metric: "REVENUE", target: 100_000 }, { title: "Vendas", metric: "SALES", target: 2 }];
    await c.call(goals.POST, "POST", "/g", { title: "Empresa", period: "MONTH", start: day1, keyResults: kr });
    await c.call(goals.POST, "POST", "/g", { title: "Bia", period: "MONTH", start: day1, memberId: bia, keyResults: kr });
    await c.call(goals.POST, "POST", "/g", { title: "Caio", period: "MONTH", start: day1, memberId: caio, keyResults: kr });
    const list = await listGoals(userId, "MONTH", new Date(`${day1}T00:00:00Z`));
    expect(list.map((g) => [g.title, g.keyResults.map((k) => k.current)])).toEqual([["Empresa", [140_000, 2]], ["Bia", [90_000, 1.5]], ["Caio", [50_000, 0.5]]]);
  });
});

describe("equipe com login", () => {
  it("a venda lançada pelo membro fica creditada a ele (para a comissão)", async () => {
    const bia = (await c.call(members.POST, "POST", "/m", { name: "Bia", email: "bia@x.test" })).data.id as string;
    const m = await join(bia, "EMISSOR");
    const r = await m.call(sales.POST, "POST", "/api/sales", { origin: "OWN", accountId: acc, occurredAt: day1, items: [{ kind: "FLIGHT", issuedWith: "POINTS", points: 5_000, salePriceCents: 20_000, passengers: 1 }] });
    expect(r.status).toBe(201);
    const s = await prisma.sale.findFirstOrThrow({ where: { userId } });
    expect(s.issuerIds).toEqual([bia]);
    // o dono lança: sem emissor (ele escolhe depois)
    await newSale(10_000, 1_000);
    expect((await prisma.sale.findMany({ where: { userId }, orderBy: { createdAt: "asc" } })).map((x) => x.issuerIds)).toEqual([[bia], []]);
  });

  it("Financeiro vê e paga; Emissor não acessa; sem Financeiro não lança na conta", async () => {
    const bia = (await c.call(members.POST, "POST", "/m", { name: "Bia", email: "bia@x.test" })).data.id as string;
    const caio = (await c.call(members.POST, "POST", "/m", { name: "Caio", email: "caio@x.test" })).data.id as string;
    const ze = (await c.call(members.POST, "POST", "/m", { name: "Zé", email: "ze@x.test" })).data.id as string;
    const fin = await join(bia, "FINANCEIRO");
    const emissor = await join(caio, "EMISSOR");
    const soMetas = await join(ze, "CUSTOM", ["metas:edit"]);
    const conta = (await c.call(finAccounts.POST, "POST", "/f", { name: "Banco", kind: "BANK", initialCents: 0 })).data;
    const contaId = conta.item?.id ?? conta.id;

    expect((await fin.call(overviewRoute.GET, "GET", "/api/commissions")).status).toBe(200);
    expect((await emissor.call(overviewRoute.GET, "GET", "/api/commissions")).status).toBe(403);
    expect((await emissor.call(goals.POST, "POST", "/api/goals", { title: "X", period: "MONTH", start: day1, keyResults: [{ title: "Y", metric: "MANUAL", target: 1 }] })).status).toBe(403);
    expect((await fin.call(rulesRoute.POST, "POST", "/api/commissions/rules", { memberId: caio, kind: "SALE_PCT", value: 300, startsAt: day1 })).status).toBe(201);

    const pago = await fin.call(payRoute.POST, "POST", "/api/commissions/pay", { memberId: caio, amountCents: 1_000, date: day1, finAccountId: contaId });
    expect(pago.status).toBe(201);
    expect((await prisma.commissionEntry.findUniqueOrThrow({ where: { id: pago.data.id } })).finTransactionId).not.toBeNull();
    expect((await soMetas.call(payRoute.POST, "POST", "/api/commissions/pay", { memberId: caio, amountCents: 1_000, date: day1, finAccountId: contaId })).status).toBe(403);
    expect((await soMetas.call(payRoute.POST, "POST", "/api/commissions/pay", { memberId: caio, amountCents: 1_000, date: day1 })).status).toBe(201);
    // e não apaga o pagamento que está no Financeiro
    expect((await soMetas.call(entryRoute.DELETE, "DELETE", `/api/commissions/entries/${pago.data.id}`, undefined, { id: pago.data.id })).status).toBe(403);
    expect((await fin.call(entryRoute.DELETE, "DELETE", `/api/commissions/entries/${pago.data.id}`, undefined, { id: pago.data.id })).status).toBe(200);
  });
});
