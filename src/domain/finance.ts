// Financeiro: categorias, saldo das contas, totais do período e fluxo de caixa. Valores em centavos, datas AAAA-MM-DD.

export type FinType = "INCOME" | "EXPENSE" | "TRANSFER";
export type Regime = "caixa" | "competencia";

/** Categorias em grupos; o lançamento guarda "Grupo › Item" (ou só o grupo quando ele não tem itens). */
export const EXPENSE_CATEGORIES: [string, string[]][] = [
  ["Compra de pontos e milhas", ["Livelo", "Esfera", "Smiles", "LATAM Pass", "Azul Fidelidade", "Outros programas"]],
  ["Custos da emissão", ["Taxa de embarque", "Bagagem", "Assento", "Seguro viagem", "Hotel", "Outros custos"]],
  ["Administrativo", ["Assinaturas", "Contabilidade", "Jurídico", "Material de escritório", "Correios", "Outros"]],
  ["Despesas financeiras", ["Tarifas bancárias", "Taxas de cartão", "IOF", "Juros"]],
  ["Impostos", ["Simples Nacional", "ISS", "IRPJ/CSLL", "Outros impostos"]],
  ["Estrutura", ["Aluguel", "Energia", "Internet", "Telefone", "Manutenção"]],
  ["Marketing", ["Anúncios", "Redes sociais", "Material gráfico", "Eventos"]],
  ["Pessoal", ["Salários", "Comissões", "Benefícios", "Treinamentos"]],
  ["Tecnologia", ["Softwares", "Equipamentos", "Hospedagem e domínio"]],
  ["Outras despesas", []],
];
export const INCOME_CATEGORIES: [string, string[]][] = [
  ["Vendas", ["Venda de milhas", "Venda de passagens", "Taxa de serviço", "Taxa de reembolso"]],
  ["Comissões recebidas", []],
  ["Rendimentos", []],
  ["Outras receitas", []],
];
export const SEP = " › ";
export const categoryOptions = (type: "INCOME" | "EXPENSE") =>
  (type === "INCOME" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).flatMap(([g, items]) => (items.length ? items.map((i) => `${g}${SEP}${i}`) : [g]));
export const categoryGroup = (c: string | null | undefined) => (c ? c.split(SEP)[0]! : "Sem categoria");

/** Compra de pontos já está descontada no lucro de cada venda: não entra de novo nas despesas operacionais. */
export const NOT_OPERATIONAL = ["Compra de pontos e milhas", "Custos da emissão"];

export type Tx = { type: FinType; accountId: string; toAccountId: string | null; amountCents: number; category: string | null; competence: string; dueDate: string; paidAt: string | null };

/** Saldo da conta: saldo inicial + o que já foi pago/recebido (pendente não conta), com as transferências. */
export function accountBalance(accountId: string, initialCents: number, txs: Tx[]) {
  let b = initialCents;
  for (const t of txs) {
    if (!t.paidAt) continue;
    if (t.type === "INCOME" && t.accountId === accountId) b += t.amountCents;
    if (t.type === "EXPENSE" && t.accountId === accountId) b -= t.amountCents;
    if (t.type === "TRANSFER") {
      if (t.accountId === accountId) b -= t.amountCents;
      if (t.toAccountId === accountId) b += t.amountCents;
    }
  }
  return b;
}

/** Data que vale no regime: caixa = quando pagou (ou o vencimento, se pendente); competência = mês a que pertence. */
export const txDay = (t: Tx, regime: Regime) => (regime === "competencia" ? t.competence : t.paidAt ?? t.dueDate).slice(0, 10);

export const monthOf = (day: string) => day.slice(0, 7);
export function addMonths(month: string, n: number) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/** Receitas e despesas do mês (sem transferências), realizadas e previstas, e por categoria. */
export function periodTotals(txs: Tx[], month: string, regime: Regime) {
  const inMonth = txs.filter((t) => t.type !== "TRANSFER" && monthOf(txDay(t, regime)) === month);
  const sum = (f: (t: Tx) => boolean) => inMonth.filter(f).reduce((s, t) => s + t.amountCents, 0);
  const byCategory = (type: FinType) => {
    const m = new Map<string, number>();
    for (const t of inMonth.filter((x) => x.type === type)) m.set(categoryGroup(t.category), (m.get(categoryGroup(t.category)) ?? 0) + t.amountCents);
    return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  };
  const income = sum((t) => t.type === "INCOME");
  const expense = sum((t) => t.type === "EXPENSE");
  return {
    income,
    expense,
    balance: income - expense,
    incomePaid: sum((t) => t.type === "INCOME" && !!t.paidAt),
    expensePaid: sum((t) => t.type === "EXPENSE" && !!t.paidAt),
    /** despesas pagas que não são custo de emissão (folha, impostos, estrutura...) */
    operational: sum((t) => t.type === "EXPENSE" && !!t.paidAt && !NOT_OPERATIONAL.includes(categoryGroup(t.category))),
    incomeByCategory: byCategory("INCOME"),
    expenseByCategory: byCategory("EXPENSE"),
  };
}

/** Fluxo de caixa: para cada mês, receitas e despesas previstas (tudo) e realizadas (pagas), e o saldo acumulado previsto. */
export function cashflow(txs: Tx[], months: string[], startBalance: number) {
  let running = startBalance;
  return months.map((month) => {
    const t = txs.filter((x) => x.type !== "TRANSFER" && monthOf(x.paidAt ?? x.dueDate) === month);
    const s = (f: (x: Tx) => boolean) => t.filter(f).reduce((a, x) => a + x.amountCents, 0);
    const row = {
      month,
      incomePlanned: s((x) => x.type === "INCOME"),
      incomeDone: s((x) => x.type === "INCOME" && !!x.paidAt),
      expensePlanned: s((x) => x.type === "EXPENSE"),
      expenseDone: s((x) => x.type === "EXPENSE" && !!x.paidAt),
    };
    running += row.incomePlanned - row.expensePlanned;
    return { ...row, net: row.incomePlanned - row.expensePlanned, running };
  });
}
