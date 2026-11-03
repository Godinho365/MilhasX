// Financeiro: saldo das contas, totais do período, fluxo de caixa, lançamentos (com repetição) e notas fiscais das vendas.
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, Client } from "./helpers";
import * as register from "@/app/api/auth/register/route";
import * as accountsRoute from "@/app/api/finance/accounts/route";
import * as accountRoute from "@/app/api/finance/accounts/[id]/route";
import * as txRoute from "@/app/api/finance/transactions/route";
import * as txOne from "@/app/api/finance/transactions/[id]/route";
import * as txPaid from "@/app/api/finance/transactions/[id]/paid/route";
import { accountBalance, cashflow, periodTotals, categoryOptions, type Tx } from "@/domain/finance";
import { financeOverview, listFinAccounts } from "@/server/services/finance";
import { prisma } from "@/server/db";

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
    expect(cashflow(txs, ["2026-11", "2026-12"], 1_000)).toEqual([
      { month: "2026-11", incomePlanned: 10_000, incomeDone: 10_000, expensePlanned: 0, expenseDone: 0, net: 10_000, running: 11_000 },
      { month: "2026-12", incomePlanned: 0, incomeDone: 0, expensePlanned: 4_000, expenseDone: 0, net: -4_000, running: 7_000 },
    ]);
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
