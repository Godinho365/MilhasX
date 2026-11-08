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

/** De onde vem o valor no fluxo de caixa: lançamento do próprio Financeiro, ou puxado sozinho das vendas
 *  (o que o cliente paga e os custos da emissão) e dos custos dos lançamentos do Extrato (compra de pontos, clube...). */
export type TxSource = "manual" | "sales" | "saleCosts" | "purchases" | "cardOther";
/** De onde veio a compra (para editar a partir da fatura): lançamento do Financeiro, do Extrato ou venda. */
export type TxRef = { kind: "fin" | "entry" | "sale"; id: string };
/** Categoria com que os valores puxados sozinhos aparecem nos totais por categoria (compra de pontos e custos da
 *  emissão já estão descontados no lucro das vendas, por isso ficam fora das despesas operacionais). */
const AUTO_CATEGORY: Record<Exclude<TxSource, "manual">, string> = { sales: "Vendas", saleCosts: "Custos da emissão", purchases: "Compra de pontos e milhas", cardOther: "Outras despesas" };

/** cardId: compra no cartão (dueDate = vencimento da fatura, paga quando a fatura é paga); chargeDay: dia da compra. */
export type Tx = { type: FinType; accountId: string; toAccountId: string | null; amountCents: number; category: string | null; competence: string; dueDate: string; paidAt: string | null; source?: TxSource; cardId?: string | null; chargeDay?: string; description?: string | null; ref?: TxRef | null };

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
const daysIn = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
/** O dia d do mês (no mês mais curto, o último dia: 31 em fevereiro vira 28 ou 29). */
const dayIn = (month: string, d: number) => `${month}-${String(Math.min(d, daysIn(month))).padStart(2, "0")}`;

/** Vencimento da fatura em que cai uma compra no cartão. Antes do dia do fechamento, entra na fatura que fecha
 *  naquele mês; no dia do fechamento ou depois, na seguinte. Vencimento depois do fechamento é no mesmo mês
 *  do fechamento; antes dele, no mês seguinte. */
export function cardDueDay(day: string, card: CardDays) {
  const closes = Number(day.slice(8, 10)) < card.closingDay ? monthOf(day) : addMonths(monthOf(day), 1);
  return dayIn(card.dueDay > card.closingDay ? closes : addMonths(closes, 1), card.dueDay);
}

/** n parcelas iguais; a 1ª fica com os centavos que sobram (como na compra parcelada). */
export function splitInstallments(totalCents: number, n: number) {
  const k = Math.max(1, Math.floor(n));
  const part = Math.floor(totalCents / k);
  return Array.from({ length: k }, (_, i) => (i === 0 ? totalCents - part * (k - 1) : part));
}

export type CardDays = { closingDay: number; dueDay: number };
/** Valor pago e, se foi no cartão, qual cartão (cardId) e os dias de fechamento e vencimento dele. */
export type PaidCost = { amountCents: number; card: CardDays | null; cardId?: string | null };

/** Saída que não tem "pago" próprio (custos do Extrato e da emissão): sem cartão, realizada quando a data já passou;
 *  num cartão cadastrado, fica em aberto até a fatura ser marcada como paga (withBillPayments). */
const outflow = (due: string, amountCents: number, source: "purchases" | "saleCosts", competence: string, today: string, extra: { cardId?: string | null; description?: string | null; ref?: TxRef | null } = {}): Tx => ({
  type: "EXPENSE", accountId: "", toAccountId: null, amountCents, category: AUTO_CATEGORY[source], competence, dueDate: due,
  paidAt: extra.cardId ? null : due <= today ? due : null, source,
  ...(extra.cardId ? { cardId: extra.cardId, chargeDay: competence } : {}), description: extra.description ?? null, ref: extra.ref ?? null,
});

/** Custos de um lançamento do Extrato no fluxo de caixa: à vista, na data; parcelado, uma parcela por mês; com as
 *  parcelas restantes antecipadas, tudo no mês da compra. No cartão, cada parcela vence numa fatura. */
export function purchaseTxs(p: { day: string; costs: PaidCost[]; installments?: number | null; anticipated?: boolean | null; description?: string | null; ref?: TxRef | null }, today: string): Tx[] {
  const n = p.anticipated ? 1 : Math.max(1, p.installments ?? 1);
  const groups = new Map<string, { card: CardDays | null; cardId: string | null; cents: number }>();
  for (const c of p.costs) {
    if (c.amountCents <= 0) continue;
    const key = c.cardId ?? (c.card ? `${c.card.closingDay}/${c.card.dueDay}` : "");
    const g = groups.get(key) ?? { card: c.card, cardId: c.cardId ?? null, cents: 0 };
    g.cents += c.amountCents;
    groups.set(key, g);
  }
  return [...groups.values()].flatMap((g) => {
    const first = g.card ? cardDueDay(p.day, g.card) : p.day;
    return splitInstallments(g.cents, n).map((cents, i) => outflow(
      g.card ? dayIn(addMonths(monthOf(first), i), g.card.dueDay) : dayIn(addMonths(monthOf(first), i), Number(first.slice(8, 10))), cents, "purchases", p.day, today,
      { cardId: g.cardId, description: p.description ? (n > 1 ? `${p.description} (${i + 1}/${n})` : p.description) : null, ref: p.ref },
    ));
  });
}

/** Venda no fluxo de caixa: entra o que o cliente paga, na data da venda (realizado quando a venda está paga);
 *  reembolsada, só a taxa de administração que fica. Os custos pagos na emissão (fornecedor, emissão em dinheiro,
 *  taxas repassadas, comissão) saem na data da venda, ou na fatura do cartão. */
export function saleTxs(s: { day: string; paidAt: string | null; totalCents: number; refunded: boolean; refundFeeCents: number; costs: PaidCost[]; description?: string | null; ref?: TxRef | null }, today: string): Tx[] {
  const amountCents = s.refunded ? s.refundFeeCents : s.totalCents;
  const income: Tx[] = amountCents > 0 ? [{ type: "INCOME", accountId: "", toAccountId: null, amountCents, category: AUTO_CATEGORY.sales, competence: s.day, dueDate: s.day, paidAt: s.paidAt, source: "sales" }] : [];
  if (s.refunded) return income; // milhas e taxas voltaram: os custos da emissão se desfazem
  return [...income, ...s.costs.filter((c) => c.amountCents > 0).map((c) => outflow(c.card ? cardDueDay(s.day, c.card) : s.day, c.amountCents, "saleCosts", s.day, today, { cardId: c.cardId, description: s.description, ref: s.ref }))];
}

/* ---------------- Faturas do cartão ---------------- */

/** A fatura é identificada pelo cartão e pelo vencimento calculado (fechamento e vencimento do cartão). */
export const billKey = (cardId: string, dueDate: string) => `${cardId}|${dueDate}`;
/** Vencimento calculado da fatura que vence no mês (o dia de vencimento do cartão). */
export const billDueIn = (month: string, card: CardDays) => dayIn(month, card.dueDay);

/** Ajustes da fatura: valor real que veio no banco e vencimento alterado só nesta fatura. */
export type BillEdit = { realCents: number | null; dueOverride: string | null };
export type BillPayment = { id: string; paidAt: string; amountCents: number; accountId: string | null };
export type BillItem = { description: string | null; amountCents: number; source: TxSource; category: string | null; day: string; ref: TxRef | null; accountId: string };
export type Bill = {
  cardId: string;
  dueDate: string; // vencimento calculado (a chave da fatura)
  effectiveDue: string; // vencimento que vale (o alterado, se houver)
  itemsCents: number; // soma das compras lançadas
  realCents: number | null; // valor real informado
  adjustCents: number; // real − compras: outros gastos (positivo) ou créditos/estornos (negativo) no cartão
  totalCents: number; // o que é para pagar
  paidCents: number;
  openCents: number; // falta pagar
  status: "open" | "partial" | "paid";
  overdue: boolean;
  paidAt: string | null; // quitada: data do último pagamento
  payments: BillPayment[];
  items: BillItem[];
};

/** Faturas: as compras no cartão (Extrato, custos das vendas e despesas do Financeiro) agrupadas por cartão e
 *  vencimento, com o valor real, o vencimento alterado e os pagamentos (pode ser parcial). Uma fatura sem compras
 *  existe quando tem valor real ou pagamento. */
export function cardBills(charges: Tx[], today: string, edits = new Map<string, BillEdit>(), payments = new Map<string, BillPayment[]>()): Bill[] {
  const groups = new Map<string, { cardId: string; dueDate: string; items: BillItem[] }>();
  const group = (cardId: string, dueDate: string) => {
    const key = billKey(cardId, dueDate);
    const g = groups.get(key) ?? { cardId, dueDate, items: [] };
    groups.set(key, g);
    return g;
  };
  for (const t of charges) {
    if (!t.cardId || t.type !== "EXPENSE") continue;
    group(t.cardId, t.dueDate).items.push({ description: t.description ?? null, amountCents: t.amountCents, source: t.source ?? "manual", category: t.category, day: t.chargeDay ?? t.competence, ref: t.ref ?? null, accountId: t.accountId });
  }
  for (const key of [...edits.keys(), ...payments.keys()]) {
    const [cardId, dueDate] = key.split("|") as [string, string];
    group(cardId, dueDate);
  }
  const sum = (xs: { amountCents: number }[]) => xs.reduce((t, x) => t + x.amountCents, 0);
  return [...groups.values()]
    .map((g): Bill => {
      const key = billKey(g.cardId, g.dueDate);
      const edit = edits.get(key);
      const pays = [...(payments.get(key) ?? [])].sort((a, b) => a.paidAt.localeCompare(b.paidAt));
      const itemsCents = sum(g.items);
      const realCents = edit?.realCents ?? null;
      const totalCents = realCents ?? itemsCents;
      const paidCents = sum(pays);
      const openCents = Math.max(0, totalCents - paidCents);
      const status = openCents === 0 ? "paid" : paidCents > 0 ? "partial" : "open";
      const effectiveDue = edit?.dueOverride ?? g.dueDate;
      return {
        cardId: g.cardId, dueDate: g.dueDate, effectiveDue, itemsCents, realCents, adjustCents: realCents == null ? 0 : realCents - itemsCents, totalCents,
        paidCents, openCents, status, overdue: status !== "paid" && effectiveDue < today, paidAt: status === "paid" ? pays.at(-1)?.paidAt ?? null : null,
        payments: pays, items: g.items.sort((x, y) => x.day.localeCompare(y.day)),
      };
    })
    .filter((b) => b.items.length > 0 || b.realCents != null || b.payments.length > 0)
    .sort((a, b) => a.effectiveDue.localeCompare(b.effectiveDue));
}

/** Divide um valor na proporção dos pesos; o último fica com o arredondamento. */
function splitByWeights<K>(cents: number, weights: { key: K; w: number }[]): { key: K; cents: number }[] {
  const total = weights.reduce((t, x) => t + x.w, 0);
  let used = 0;
  return weights.map((x, i) => {
    const v = i === weights.length - 1 ? cents - used : Math.floor((cents * x.w) / total);
    used += v;
    return { key: x.key, cents: v };
  });
}

/** Saída de caixa das faturas: cada pagamento na data em que foi feito (e da conta de onde saiu) e o que falta pagar
 *  no vencimento. Dividida pela origem e categoria das compras da fatura (outros gastos entram em "Outras despesas"). */
export function billCashTxs(bills: Bill[]): Tx[] {
  return bills.flatMap((b) => {
    const byKey = new Map<string, { source: TxSource; category: string | null; w: number }>();
    for (const i of b.items) {
      const k = `${i.source}|${i.category ?? ""}`;
      const x = byKey.get(k) ?? { source: i.source, category: i.category, w: 0 };
      x.w += i.amountCents;
      byKey.set(k, x);
    }
    if (b.adjustCents > 0) byKey.set("cardOther|", { source: "cardOther", category: AUTO_CATEGORY.cardOther, w: b.adjustCents });
    const weights = [...byKey.values()].filter((x) => x.w > 0).map((x) => ({ key: x, w: x.w }));
    const parts = (cents: number) => (weights.length ? splitByWeights(cents, weights) : [{ key: { source: "cardOther" as TxSource, category: AUTO_CATEGORY.cardOther }, cents }]);
    const tx = (cents: number, paidAt: string | null, accountId: string | null): Tx[] =>
      parts(cents).filter((p) => p.cents !== 0).map((p) => ({
        type: "EXPENSE", accountId: accountId ?? "", toAccountId: null, amountCents: p.cents, category: p.key.category, competence: b.effectiveDue,
        dueDate: b.effectiveDue, paidAt, source: p.key.source, description: "Fatura do cartão",
      }));
    return [...b.payments.flatMap((p) => tx(p.amountCents, p.paidAt, p.accountId)), ...(b.openCents > 0 ? tx(b.openCents, null, null) : [])];
  });
}

/** Diferença entre o valor real da fatura e as compras lançadas, no regime de competência: a mais, "Outras despesas";
 *  a menos (estorno, crédito), "Outras receitas". */
export function billAdjustTxs(bills: Bill[]): Tx[] {
  return bills.filter((b) => b.adjustCents !== 0).map((b) => ({
    type: b.adjustCents > 0 ? "EXPENSE" : "INCOME", accountId: "", toAccountId: null, amountCents: Math.abs(b.adjustCents),
    category: b.adjustCents > 0 ? AUTO_CATEGORY.cardOther : "Outras receitas", competence: b.effectiveDue, dueDate: b.effectiveDue,
    paidAt: b.paidAt, source: "cardOther", description: b.adjustCents > 0 ? "Outros gastos no cartão" : "Créditos na fatura do cartão",
  }));
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

/** Fluxo de caixa: para cada mês, receitas e despesas previstas (tudo) e realizadas (pagas), por origem, e o saldo acumulado previsto. */
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
    const part = (type: FinType, src: TxSource) => {
      const of = (x: Tx) => x.type === type && (x.source ?? "manual") === src;
      return { planned: s(of), done: s((x) => of(x) && !!x.paidAt) };
    };
    const parts = { sales: part("INCOME", "sales"), manualIncome: part("INCOME", "manual"), purchases: part("EXPENSE", "purchases"), saleCosts: part("EXPENSE", "saleCosts"), cardOther: part("EXPENSE", "cardOther"), manualExpense: part("EXPENSE", "manual") };
    running += row.incomePlanned - row.expensePlanned;
    return { ...row, net: row.incomePlanned - row.expensePlanned, running, parts };
  });
}
