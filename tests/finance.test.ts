// Financeiro: saldo das contas, totais do período, fluxo de caixa, lançamentos (com repetição) e notas fiscais das vendas.
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, Client, seedPrograms } from "./helpers";
import * as register from "@/app/api/auth/register/route";
import * as accountsRoute from "@/app/api/finance/accounts/route";
import * as accountRoute from "@/app/api/finance/accounts/[id]/route";
import * as txRoute from "@/app/api/finance/transactions/route";
import * as txOne from "@/app/api/finance/transactions/[id]/route";
import * as txPaid from "@/app/api/finance/transactions/[id]/paid/route";
import * as holders from "@/app/api/holders/route";
import * as milesAccounts from "@/app/api/accounts/route";
import * as entries from "@/app/api/entries/route";
import * as sales from "@/app/api/sales/route";
import * as salePayment from "@/app/api/sales/[id]/payment/route";
import * as cardsRoute from "@/app/api/cards/route";
import * as cardBillsRoute from "@/app/api/finance/card-bills/route";
import { accountBalance, billKey, cardBills, cardDueDay, cashflow, periodTotals, purchaseTxs, saleTxs, withBillPayments, categoryOptions, type Tx } from "@/domain/finance";
import { financeCashflow, financeOverview, listFinAccounts } from "@/server/services/finance";
import { prisma } from "@/server/db";
import { brDay } from "@/domain/brasilia";

const tx = (o: Partial<Tx>): Tx => ({ type: "EXPENSE", accountId: "a", toAccountId: null, amountCents: 100, category: null, competence: "2026-11-01", dueDate: "2026-11-05", paidAt: null, ...o });

describe("contas do financeiro (domínio)", () => {
  it("saldo: inicial + pagos, com transferências; pendente não conta", () => {
    const txs = [
      tx({ type: "INCOME", amountCents: 50_000, paidAt: "2026-11-02" }),
      tx({ type: "EXPENSE", amountCents: 20_000, paidAt: "2026-11-03" }),
      tx({ type: "EXPENSE", amountCents: 99_999 }), // pendente
      tx({ type: "TRANSFER", accountId: "a", toAccountId: "b", amountCents: 10_000, paidAt: "2026-11-04" }),
    ];
    expect(accountBalance("a", 1_000, txs)).toBe(1_000 + 50_000 - 20_000 - 10_000);
    expect(accountBalance("b", 0, txs)).toBe(10_000);
  });

  it("período: caixa pela data de pagamento, competência pelo mês; compra de pontos fora das operacionais", () => {
    const txs = [
      tx({ type: "INCOME", amountCents: 30_000, category: "Vendas › Taxa de serviço", competence: "2026-10-20", dueDate: "2026-11-02", paidAt: "2026-11-02" }),
      tx({ type: "EXPENSE", amountCents: 5_000, category: "Impostos › ISS", paidAt: "2026-11-10" }),
      tx({ type: "EXPENSE", amountCents: 70_000, category: "Compra de pontos e milhas › Livelo", paidAt: "2026-11-10" }),
      tx({ type: "EXPENSE", amountCents: 2_000, category: "Estrutura › Internet", dueDate: "2026-11-20" }), // pendente
    ];
    const caixa = periodTotals(txs, "2026-11", "caixa");
    expect(caixa).toMatchObject({ income: 30_000, expense: 77_000, incomePaid: 30_000, expensePaid: 75_000, operational: 5_000 });
    expect(caixa.expenseByCategory[0]).toEqual({ name: "Compra de pontos e milhas", value: 70_000 });
    expect(periodTotals(txs, "2026-11", "competencia").income).toBe(0); // a receita é da competência de outubro
    expect(periodTotals(txs, "2026-10", "competencia").income).toBe(30_000);
  });

  it("fluxo de caixa: previsto, realizado e saldo acumulado", () => {
    const txs = [tx({ type: "INCOME", amountCents: 10_000, dueDate: "2026-11-01", paidAt: "2026-11-01" }), tx({ type: "EXPENSE", amountCents: 4_000, dueDate: "2026-12-05" })];
    expect(cashflow(txs, ["2026-11", "2026-12"], 1_000)).toMatchObject([
      { month: "2026-11", incomePlanned: 10_000, incomeDone: 10_000, expensePlanned: 0, expenseDone: 0, net: 10_000, running: 11_000 },
      { month: "2026-12", incomePlanned: 0, incomeDone: 0, expensePlanned: 4_000, expenseDone: 0, net: -4_000, running: 7_000 },
    ]);
    // separado por origem: lançado no Financeiro, vendas, custos das vendas e custos do Extrato
    const mixed = [...txs, tx({ type: "INCOME", amountCents: 45_000, dueDate: "2026-11-05", paidAt: null, source: "sales" }), tx({ amountCents: 9_000, dueDate: "2026-11-05", paidAt: "2026-11-05", source: "purchases" })];
    expect(cashflow(mixed, ["2026-11"], 0)[0]!.parts).toEqual({
      sales: { planned: 45_000, done: 0 }, manualIncome: { planned: 10_000, done: 10_000 },
      purchases: { planned: 9_000, done: 9_000 }, saleCosts: { planned: 0, done: 0 }, manualExpense: { planned: 0, done: 0 },
    });
  });

  it("vencimento da fatura em que cai a compra no cartão", () => {
    const card = { closingDay: 10, dueDay: 17 };
    expect(cardDueDay("2026-11-05", card)).toBe("2026-11-17");
    expect(cardDueDay("2026-11-10", card)).toBe("2026-12-17"); // no dia do fechamento já é a fatura seguinte
    expect(cardDueDay("2026-11-20", { closingDay: 25, dueDay: 5 })).toBe("2026-12-05"); // vence no mês seguinte ao fechamento
    expect(cardDueDay("2026-11-26", { closingDay: 25, dueDay: 5 })).toBe("2027-01-05");
    expect(cardDueDay("2027-01-25", { closingDay: 20, dueDay: 31 })).toBe("2027-02-28");
  });

  it("custos do Extrato: parcelado, uma parcela por mês; antecipado, tudo no mês; no cartão, na fatura", () => {
    const today = "2026-11-07";
    const parc = purchaseTxs({ day: "2026-10-31", costs: [{ amountCents: 308_000, card: null }], installments: 12 }, today);
    expect(parc).toHaveLength(12);
    expect(parc.slice(0, 3).map((t) => [t.dueDate, t.amountCents, t.paidAt])).toEqual([["2026-10-31", 25_674, "2026-10-31"], ["2026-11-30", 25_666, null], ["2026-12-31", 25_666, null]]);
    expect(parc.reduce((t, x) => t + x.amountCents, 0)).toBe(308_000);
    expect(parc.every((t) => t.type === "EXPENSE" && t.source === "purchases")).toBe(true);
    expect(purchaseTxs({ day: "2026-11-04", costs: [{ amountCents: 294_249, card: null }], installments: 12, anticipated: true }, today).map((t) => [t.dueDate, t.amountCents])).toEqual([["2026-11-04", 294_249]]);
    const card = { closingDay: 10, dueDay: 17 };
    expect(purchaseTxs({ day: "2026-11-12", costs: [{ amountCents: 90_000, card }, { amountCents: 1_000, card: null }], installments: 3 }, today).map((t) => [t.dueDate, t.amountCents])).toEqual([
      ["2026-12-17", 30_000], ["2027-01-17", 30_000], ["2027-02-17", 30_000], ["2026-11-12", 334], ["2026-12-12", 333], ["2027-01-12", 333],
    ]);
  });

  it("venda: entra o que o cliente paga; custos da emissão saem na data (ou na fatura); reembolsada, só a taxa", () => {
    const today = "2026-11-07";
    const card = { closingDay: 10, dueDay: 17 };
    const sale = { day: "2026-11-05", paidAt: null, totalCents: 45_000, refunded: false, refundFeeCents: 0, costs: [{ amountCents: 5_000, card }, { amountCents: 2_000, card: null }, { amountCents: 0, card: null }] };
    expect(saleTxs(sale, today).map((t) => t.category)).toEqual(["Vendas", "Custos da emissão", "Custos da emissão"]);
    expect(purchaseTxs({ day: "2026-11-04", costs: [{ amountCents: 100, card: null }] }, today)[0]!.category).toBe("Compra de pontos e milhas");
    expect(saleTxs(sale, today).map((t) => [t.type, t.source, t.dueDate, t.amountCents, t.paidAt])).toEqual([
      ["INCOME", "sales", "2026-11-05", 45_000, null],
      ["EXPENSE", "saleCosts", "2026-11-17", 5_000, null],
      ["EXPENSE", "saleCosts", "2026-11-05", 2_000, "2026-11-05"],
    ]);
    expect(saleTxs({ ...sale, paidAt: "2026-11-06", refunded: true, refundFeeCents: 3_000 }, today).map((t) => [t.type, t.amountCents, t.paidAt])).toEqual([["INCOME", 3_000, "2026-11-06"]]);
  });

  it("faturas: compras no cartão agrupadas por vencimento; ficam em aberto até a fatura ser paga", () => {
    const today = "2026-11-07";
    const card = { closingDay: 10, dueDay: 17 };
    const txs = [
      ...purchaseTxs({ day: "2026-10-01", costs: [{ amountCents: 30_000, card, cardId: "c1" }], installments: 3, description: "Livelo" }, today),
      ...saleTxs({ day: "2026-10-05", paidAt: null, totalCents: 0, refunded: false, refundFeeCents: 0, costs: [{ amountCents: 2_000, card, cardId: "c1" }], description: "Custos da venda" }, today),
    ];
    // no cartão, a data passar não basta: só fica paga com a fatura
    expect(txs.every((t) => t.cardId === "c1" && t.paidAt === null)).toBe(true);
    expect(txs.map((t) => t.description)).toEqual(["Livelo (1/3)", "Livelo (2/3)", "Livelo (3/3)", "Custos da venda"]);
    expect(cardBills(txs, today).map((b) => [b.dueDate, b.totalCents, b.overdue])).toEqual([["2026-10-17", 12_000, true], ["2026-11-17", 10_000, false], ["2026-12-17", 10_000, false]]);
    const paid = cardBills(withBillPayments(txs, new Map([[billKey("c1", "2026-10-17"), "2026-10-16"]])), today);
    expect(paid[0]).toMatchObject({ paidAt: "2026-10-16", overdue: false });
    expect(paid[0]!.items.map((i) => [i.day, i.amountCents, i.source])).toEqual([["2026-10-01", 10_000, "purchases"], ["2026-10-05", 2_000, "saleCosts"]]);
    expect(paid.slice(1).every((b) => b.paidAt === null)).toBe(true);
  });

  it("categorias em grupo › item", () => {
    expect(categoryOptions("EXPENSE")).toContain("Impostos › ISS");
    expect(categoryOptions("INCOME")).toContain("Rendimentos");
  });
});

let c: Client;
let userId: string;
beforeEach(async () => {
  await resetDb();
  c = new Client();
  userId = (await c.call(register.POST, "POST", "/r", { name: "Ana", email: "ana@x.test", password: "senha-forte-1" })).data.user.id;
});

describe("lançamentos do financeiro", () => {
  it("cria contas, lança, repete por meses, marca pago e atualiza o saldo e a visão geral", async () => {
    const bank = (await c.call(accountsRoute.POST, "POST", "/x", { name: "Banco", kind: "BANK", initialCents: 100_000 })).data.id;
    const cash = (await c.call(accountsRoute.POST, "POST", "/x", { name: "Caixa", kind: "CASH", initialCents: 0 })).data.id;
    const rent = await c.call(txRoute.POST, "POST", "/x", { type: "EXPENSE", accountId: bank, category: "Estrutura › Aluguel", amountCents: 150_000, description: "Aluguel", competence: "2026-11-01", dueDate: "2026-11-10", paid: true, repeatMonths: 3 });
    expect([rent.status, rent.data.created]).toEqual([201, 3]);
    expect(await prisma.finTransaction.count({ where: { userId, paidAt: null } })).toBe(2); // só o primeiro nasce pago
    await c.call(txRoute.POST, "POST", "/x", { type: "TRANSFER", accountId: bank, toAccountId: cash, amountCents: 20_000, competence: "2026-11-02", dueDate: "2026-11-02", paid: true });
    expect((await c.call(txRoute.POST, "POST", "/x", { type: "TRANSFER", accountId: bank, toAccountId: bank, amountCents: 1, competence: "2026-11-02", dueDate: "2026-11-02", paid: true })).status).toBe(400);
    const fee = (await c.call(txRoute.POST, "POST", "/x", { type: "INCOME", accountId: cash, category: "Vendas › Taxa de serviço", amountCents: 30_000, competence: "2026-11-03", dueDate: "2026-11-03", paid: false }));
    expect(fee.status).toBe(201);

    let accs = await listFinAccounts(userId);
    expect(accs.map((a) => [a.name, a.balanceCents])).toEqual([["Banco", 100_000 - 150_000 - 20_000], ["Caixa", 20_000]]);

    const list = (await c.call(txRoute.GET, "GET", "/api/finance/transactions?mes=2026-11&tipo=INCOME")).data.items;
    expect(list).toHaveLength(1);
    expect((await c.call(txPaid.POST, "POST", "/x", { paid: true, date: "2026-11-04" }, { id: list[0].id })).status).toBe(200);
    accs = await listFinAccounts(userId);
    expect(accs.find((a) => a.name === "Caixa")!.balanceCents).toBe(50_000);

    const o = await financeOverview(userId, "2026-11", "caixa");
    expect(o.period).toMatchObject({ income: 30_000, expense: 150_000, operational: 150_000 });
    expect(o.balance).toMatchObject({ cash: 100_000 - 150_000 + 30_000, payable: 300_000 });
    expect(o.toPay).toHaveLength(2);

    // edição e exclusão
    expect((await c.call(txOne.PUT, "PUT", "/x", { type: "INCOME", accountId: cash, amountCents: 40_000, competence: "2026-11-03", dueDate: "2026-11-03", paid: true }, { id: list[0].id })).status).toBe(200);
    expect((await listFinAccounts(userId)).find((a) => a.name === "Caixa")!.balanceCents).toBe(60_000);
    expect((await c.call(txOne.DELETE, "DELETE", "/x", undefined, { id: list[0].id })).status).toBe(200);
    // conta com lançamentos é arquivada; vazia é excluída
    expect((await c.call(accountRoute.DELETE, "DELETE", "/x", undefined, { id: cash })).data.result).toBe("archived");
    const empty = (await c.call(accountsRoute.POST, "POST", "/x", { name: "Vazia", kind: "OTHER", initialCents: 0 })).data.id;
    expect((await c.call(accountRoute.DELETE, "DELETE", "/x", undefined, { id: empty })).data.result).toBe("deleted");
  });

  it("isola por usuário", async () => {
    const bank = (await c.call(accountsRoute.POST, "POST", "/x", { name: "Banco", kind: "BANK", initialCents: 0 })).data.id;
    await c.call(txRoute.POST, "POST", "/x", { type: "EXPENSE", accountId: bank, amountCents: 1_000, competence: "2026-11-01", dueDate: "2026-11-01", paid: false });
    const id = (await prisma.finTransaction.findFirstOrThrow({ where: { userId } })).id;
    const o = new Client();
    await o.call(register.POST, "POST", "/r", { name: "Outro", email: "o@x.test", password: "senha-forte-2" });
    expect((await o.call(accountsRoute.GET, "GET", "/x")).data.items).toHaveLength(0);
    expect((await o.call(txRoute.POST, "POST", "/x", { type: "EXPENSE", accountId: bank, amountCents: 1, competence: "2026-11-01", dueDate: "2026-11-01", paid: false })).status).toBe(404);
    expect((await o.call(txPaid.POST, "POST", "/x", { paid: true }, { id })).status).toBe(404);
    expect((await o.call(txOne.DELETE, "DELETE", "/x", undefined, { id })).status).toBe(404);
    expect((await o.call(accountRoute.PUT, "PUT", "/x", { name: "x", kind: "BANK", initialCents: 0 }, { id: bank })).status).toBe(404);
  });
});

describe("fluxo de caixa com vendas e compras de pontos", () => {
  it("puxa sozinho as vendas e os custos do Extrato, sem nada lançado no Financeiro", async () => {
    const p = await seedPrograms();
    const h = (await c.call(holders.POST, "POST", "/h", { name: "Ana" })).data.item.id;
    const lat = (await c.call(milesAccounts.POST, "POST", "/a", { holderId: h, programId: p.latam.id })).data.item.id;
    // compra de R$ 300,00 em 3x (janeiro, fevereiro e março)
    const buy = await c.call(entries.POST, "POST", "/e", { accountId: lat, type: "PURCHASE", points: 30_000, occurredAt: "2026-01-10", costs: [{ type: "PONTOS", amountCents: 30_000 }], details: { payment: { installments: 3, anticipated: false, nominalCents: 30_000, paidCents: 30_000, discountCents: 0 } } });
    expect(buy.status).toBe(201);
    // venda de R$ 400,00 + R$ 50,00 de taxa de embarque paga por mim e repassada; o cliente paga em 20/02
    const sale = await c.call(sales.POST, "POST", "/api/sales", { origin: "OWN", accountId: lat, occurredAt: "2026-02-05", items: [{ kind: "FLIGHT", issuedWith: "POINTS", points: 10_000, salePriceCents: 40_000, passengers: 1, costs: [{ type: "TAXA_EMBARQUE", amountCents: 5_000 }] }] });
    expect(sale.status).toBe(201);
    expect((await c.call(salePayment.POST, "POST", "/p", { paid: true, date: "2026-02-20" }, { id: sale.data.item.id })).status).toBe(200);
    // lançamento em lote guarda só o total do custo (sem linhas de custo)
    await prisma.entry.create({ data: { userId, accountId: lat, type: "CLUB", points: 1_000, inputCostCents: 1_000, occurredAt: new Date("2026-03-01T00:00:00Z"), description: "Clube" } });

    const { months } = await financeCashflow(userId, "2026-02");
    expect(months.map((m) => [m.month, m.incomePlanned, m.incomeDone, m.expensePlanned, m.expenseDone, m.running])).toEqual([
      ["2025-12", 0, 0, 0, 0, 0],
      ["2026-01", 0, 0, 10_000, 10_000, -10_000],
      ["2026-02", 45_000, 45_000, 15_000, 15_000, 20_000],
      ["2026-03", 0, 0, 11_000, 11_000, 9_000],
      ["2026-04", 0, 0, 0, 0, 9_000],
    ]);
    expect(months[2]!.parts).toMatchObject({ sales: { planned: 45_000 }, purchases: { planned: 10_000 }, saleCosts: { planned: 5_000 }, manualExpense: { planned: 0 } });

    // a Visão Geral mostra as mesmas receitas e despesas, por categoria; compra de pontos e custos da emissão
    // ficam fora das despesas operacionais (já estão no lucro das vendas)
    const feb = await financeOverview(userId, "2026-02", "caixa");
    expect(feb.period).toMatchObject({ income: 45_000, incomePaid: 45_000, expense: 15_000, expensePaid: 15_000, balance: 30_000, operational: 0 });
    expect(feb.period.incomeByCategory).toEqual([{ name: "Vendas", value: 45_000 }]);
    expect(feb.period.expenseByCategory).toEqual([{ name: "Compra de pontos e milhas", value: 10_000 }, { name: "Custos da emissão", value: 5_000 }]);
    // competência: a compra parcelada pertence toda ao mês da compra
    expect((await financeOverview(userId, "2026-01", "competencia")).period.expense).toBe(30_000);
    expect(feb.balance).toMatchObject({ payable: 0, toPayPurchases: 0 });
    // compra de hoje em 12x: as 11 parcelas que ainda vão vencer entram no passivo
    await c.call(entries.POST, "POST", "/e", { accountId: lat, type: "PURCHASE", points: 12_000, occurredAt: brDay(), costs: [{ type: "PONTOS", amountCents: 120_000 }], details: { payment: { installments: 12, anticipated: false, nominalCents: 120_000, paidCents: 120_000, discountCents: 0 } } });
    expect((await financeOverview(userId, "2026-02", "caixa")).balance).toMatchObject({ payable: 110_000, toPayPurchases: 110_000 });

    // outro usuário não vê nada disso
    const o = new Client();
    const oid = (await o.call(register.POST, "POST", "/r", { name: "Outro", email: "o2@x.test", password: "senha-forte-2" })).data.user.id;
    expect((await financeCashflow(oid, "2026-02")).months.every((m) => m.incomePlanned === 0 && m.expensePlanned === 0)).toBe(true);
  });
});

describe("faturas dos cartões", () => {
  it("soma o que passou em cada cartão, marca a fatura paga e a despesa do Financeiro acompanha", async () => {
    const p = await seedPrograms();
    const h = (await c.call(holders.POST, "POST", "/h", { name: "Ana" })).data.item.id;
    const lat = (await c.call(milesAccounts.POST, "POST", "/a", { holderId: h, programId: p.latam.id })).data.item.id;
    const bank = (await c.call(accountsRoute.POST, "POST", "/x", { name: "Banco", kind: "BANK", initialCents: 100_000 })).data.id;
    const cardA = (await c.call(cardsRoute.POST, "POST", "/c", { accountId: lat, name: "Cartão A", pointsPerDollar: 220, dollarRateCents: 550, closingDay: 3, dueDay: 10 })).data.item.id;
    const cardB = (await c.call(cardsRoute.POST, "POST", "/c", { accountId: lat, name: "Cartão B", pointsPerDollar: 220, dollarRateCents: 550, closingDay: 25, dueDay: 5 })).data.item.id;

    // compra de pontos em 3x no cartão A (dia 5, depois do fechamento dia 3: 1ª parcela na fatura de 10/02) + IOF fora do cartão
    expect((await c.call(entries.POST, "POST", "/e", { accountId: lat, type: "PURCHASE", points: 30_000, occurredAt: "2026-01-05", costs: [{ type: "PONTOS", amountCents: 30_000, cardId: cardA }, { type: "IOF", amountCents: 1_000 }], details: { payment: { installments: 3, anticipated: false, nominalCents: 31_000, paidCents: 31_000, discountCents: 0 } } })).status).toBe(201);
    // despesa do Financeiro no cartão B (dia 20, antes do fechamento dia 25: fatura que vence 05/02); não pode nascer paga
    expect((await c.call(txRoute.POST, "POST", "/x", { type: "EXPENSE", accountId: bank, category: "Tecnologia › Softwares", amountCents: 5_000, description: "Assinatura", competence: "2026-01-20", dueDate: "2026-01-20", paid: true, cardId: cardB })).status).toBe(201);
    expect((await c.call(txRoute.POST, "POST", "/x", { type: "INCOME", accountId: bank, amountCents: 1, competence: "2026-01-20", dueDate: "2026-01-20", paid: false, cardId: cardB })).status).toBe(400);
    // venda com taxa de embarque paga no cartão B (dia 26: fatura que vence 05/03)
    expect((await c.call(sales.POST, "POST", "/api/sales", { origin: "OWN", accountId: lat, occurredAt: "2026-01-26", items: [{ kind: "FLIGHT", issuedWith: "POINTS", points: 10_000, salePriceCents: 40_000, passengers: 1, costs: [{ type: "TAXA_EMBARQUE", amountCents: 2_000, cardId: cardB }] }] })).status).toBe(201);

    const bills = async () => (await c.call(cardBillsRoute.GET, "GET", "/api/finance/card-bills")).data.items as { id: string; openCents: number; overdueCents: number; open: { dueDate: string; totalCents: number; items: unknown[] }[]; paid: { dueDate: string; paidAt: string }[] }[];
    let list = await bills();
    const a = list.find((x) => x.id === cardA)!, b = list.find((x) => x.id === cardB)!;
    expect(a.open.map((x) => [x.dueDate, x.totalCents])).toEqual([["2026-02-10", 10_000], ["2026-03-10", 10_000], ["2026-04-10", 10_000]]);
    expect([a.openCents, a.overdueCents]).toEqual([30_000, 30_000]);
    expect(b.open.map((x) => [x.dueDate, x.totalCents])).toEqual([["2026-02-05", 5_000], ["2026-03-05", 2_000]]);
    const balance = async () => (await listFinAccounts(userId)).find((x) => x.id === bank)!.balanceCents;
    expect(await balance()).toBe(100_000); // a despesa no cartão só sai da conta quando a fatura é paga

    // despesa no cartão não se marca paga sozinha
    const assinatura = await prisma.finTransaction.findFirstOrThrow({ where: { userId, cardId: cardB } });
    expect((await c.call(txPaid.POST, "POST", "/x", { paid: true }, { id: assinatura.id })).status).toBe(409);

    // paga a fatura de 05/02 do cartão B no dia 04/02
    expect((await c.call(cardBillsRoute.POST, "POST", "/x", { cardId: cardB, dueDates: ["2026-02-05"], paid: true, date: "2026-02-04" })).status).toBe(200);
    expect(await balance()).toBe(95_000);
    const jan = (await c.call(txRoute.GET, "GET", "/api/finance/transactions?mes=2026-01")).data.items;
    expect(jan.find((t: { id: string }) => t.id === assinatura.id)).toMatchObject({ paidAt: "2026-02-04", card: "Cartão B", billDue: "2026-02-05", overdue: false });
    list = await bills();
    expect(list.find((x) => x.id === cardB)!.paid).toMatchObject([{ dueDate: "2026-02-05", paidAt: "2026-02-04" }]);

    // fluxo de caixa de fevereiro: cartão A em aberto (previsto), IOF e a fatura paga do cartão B realizados
    const feb = (await financeCashflow(userId, "2026-02")).months.find((m) => m.month === "2026-02")!;
    expect([feb.expensePlanned, feb.expenseDone]).toEqual([10_000 + 333 + 5_000, 333 + 5_000]);
    // Visão Geral: faturas em aberto no passivo e em Contas a pagar
    const o = await financeOverview(userId, "2026-02", "caixa");
    expect(o.balance).toMatchObject({ toPayBills: 32_000, payable: 32_000 });
    expect(o.toPay.map((t) => [t.description, t.dueDate, t.amountCents])).toEqual([
      ["Fatura Cartão A", "2026-02-10", 10_000], ["Fatura Cartão B", "2026-03-05", 2_000], ["Fatura Cartão A", "2026-03-10", 10_000], ["Fatura Cartão A", "2026-04-10", 10_000],
    ]);

    // fatura que não existe e cartão de outro usuário
    expect((await c.call(cardBillsRoute.POST, "POST", "/x", { cardId: cardA, dueDates: ["2026-02-11"], paid: true })).status).toBe(404);
    const o2 = new Client();
    await o2.call(register.POST, "POST", "/r", { name: "Outro", email: "o3@x.test", password: "senha-forte-3" });
    expect((await o2.call(cardBillsRoute.POST, "POST", "/x", { cardId: cardA, dueDates: ["2026-02-10"], paid: true })).status).toBe(404);
    expect((await o2.call(cardBillsRoute.GET, "GET", "/x")).data.items).toEqual([]);

    // desfaz e paga as três do cartão A de uma vez
    expect((await c.call(cardBillsRoute.POST, "POST", "/x", { cardId: cardB, dueDates: ["2026-02-05"], paid: false })).status).toBe(200);
    expect(await balance()).toBe(100_000);
    expect((await c.call(cardBillsRoute.POST, "POST", "/x", { cardId: cardA, dueDates: ["2026-02-10", "2026-03-10", "2026-04-10"], paid: true })).status).toBe(200);
    list = await bills();
    expect(list.find((x) => x.id === cardA)).toMatchObject({ openCents: 0, overdueCents: 0 });
    expect(await prisma.cardBillPayment.findMany({ where: { cardId: cardA }, select: { amountCents: true } })).toEqual(expect.arrayContaining([{ amountCents: 10_000 }]));
  });
});
