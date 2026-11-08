import Link from "next/link";
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Scale, Wallet, Coins, ReceiptText, Landmark, PiggyBank } from "lucide-react";
import { requirePageUser } from "@/server/session";
import { financeCashflow, financeOverview, listCardBills, listCardOptions, listFinAccounts, listFinTx } from "@/server/services/finance";
import { PageHeader, Stat } from "@/components/stat";
import { Segmented } from "@/components/ui";
import { fmtBRL, fmtDate } from "@/lib/format";
import { brDay } from "@/domain/brasilia";
import { addMonths, type Regime } from "@/domain/finance";
import { TransactionsClient, AccountsClient, CardBillsClient } from "./client";

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const monthName = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const short = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]!.slice(0, 3)}/${m.slice(2, 4)}`;
const TABS = [["visao", "Visão Geral"], ["fluxo", "Fluxo de Caixa"], ["lancamentos", "Lançamentos"], ["faturas", "Faturas"], ["contas", "Contas"]] as const;

export default async function FinancePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === sp.aba) ? sp.aba! : "visao";
  const month = /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? sp.mes! : brDay().slice(0, 7);
  const regime: Regime = sp.regime === "competencia" ? "competencia" : "caixa";
  const href = (patch: Record<string, string>) => `/app/financeiro?${new URLSearchParams({ aba: tab, mes: month, regime, ...patch })}`;
  return (
    <>
      <PageHeader title="Financeiro" subtitle="Receitas, despesas, contas e o resultado da operação">
        <div className="flex items-center gap-1 rounded-xl border border-line bg-panel px-1">
          <Link href={href({ mes: addMonths(month, -1) })} className="btn-subtle h-9 w-9 px-0" aria-label="Mês anterior"><ChevronLeft className="h-4 w-4" /></Link>
          <span className="min-w-[130px] text-center text-sm font-semibold first-letter:uppercase">{monthName(month)}</span>
          <Link href={href({ mes: addMonths(month, 1) })} className="btn-subtle h-9 w-9 px-0" aria-label="Próximo mês"><ChevronRight className="h-4 w-4" /></Link>
        </div>
        <div className="inline-flex gap-1 rounded-xl border border-line bg-panel p-1" role="group" aria-label="Regime">
          {(["caixa", "competencia"] as const).map((r) => (
            <Link key={r} href={href({ regime: r })} aria-pressed={regime === r} title={r === "caixa" ? "Pela data em que o dinheiro entrou ou saiu" : "Pelo mês a que a receita ou despesa pertence"} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${regime === r ? "bg-panel2 text-white shadow-sm" : "text-muted hover:text-zinc-100"}`}>{r === "caixa" ? "Caixa" : "Competência"}</Link>
          ))}
        </div>
      </PageHeader>
      <Segmented active={tab} items={TABS.map(([k, l]) => ({ key: k, label: l, href: href({ aba: k }) }))} />
      {tab === "visao" && <Overview userId={user.id} month={month} regime={regime} />}
      {tab === "fluxo" && <Cashflow userId={user.id} month={month} />}
      {tab === "lancamentos" && <TransactionsClient month={month} regime={regime} items={await listFinTx(user.id, month, regime, { type: sp.tipo, status: sp.status === "pago" || sp.status === "pendente" ? sp.status : undefined })} accounts={(await listFinAccounts(user.id)).filter((a) => !a.archived)} filters={{ tipo: sp.tipo ?? "", status: sp.status ?? "" }} cards={await listCardOptions(user.id)} />}
      {tab === "faturas" && <CardBillsClient cards={await listCardBills(user.id)} accounts={(await listFinAccounts(user.id)).filter((a) => !a.archived).map((a) => ({ id: a.id, name: a.name }))} />}
      {tab === "contas" && <AccountsClient accounts={await listFinAccounts(user.id)} />}
    </>
  );
}

function Breakdown({ title, items, total, tone }: { title: string; items: { name: string; value: number }[]; total: number; tone: string }) {
  return (
    <section className="card card-pad" aria-label={title}>
      <h2 className="mb-3 font-semibold">{title}</h2>
      {items.length === 0 ? <p className="py-4 text-sm text-muted">Nada no período.</p> : (
        <ul className="space-y-2.5">
          {items.map((i) => (
            <li key={i.name} className="text-sm">
              <div className="flex justify-between gap-2"><span className="truncate">{i.name}</span><span className="tabular-nums text-muted">{fmtBRL(i.value)}</span></div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-panel2"><div className={`h-full rounded-full ${tone}`} style={{ width: `${total ? Math.round((i.value / total) * 100) : 0}%` }} /></div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

async function Overview({ userId, month, regime }: { userId: string; month: string; regime: Regime }) {
  const o = await financeOverview(userId, month, regime);
  const due = (list: typeof o.toPay, empty: string, kind: "pagar" | "receber") => (
    list.length === 0 ? <p className="py-4 text-sm text-muted">{empty}</p> : (
      <ul className="divide-y divide-line text-sm">
        {list.map((t) => (
          <li key={t.id} className="flex items-center gap-3 py-2">
            <span className={`w-20 shrink-0 tabular-nums ${t.overdue ? "text-red-300" : "text-muted"}`}>{fmtDate(t.dueDate)}</span>
            <span className="min-w-0 flex-1 truncate">{t.description || t.category || (kind === "pagar" ? "Despesa" : "Receita")}{t.counterpart ? <span className="text-muted"> · {t.counterpart}</span> : null}</span>
            <span className="tabular-nums font-medium">{fmtBRL(t.amountCents)}</span>
          </li>
        ))}
      </ul>
    )
  );
  return (
    <div className="space-y-5">
      <section aria-label="Receitas e despesas do período">
        <h2 className="kicker mb-2">Receitas e despesas do período</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat icon={<TrendingUp className="h-4 w-4" />} label="Receitas" value={fmtBRL(o.period.income)} hint={`${fmtBRL(o.period.incomePaid)} recebidas`} />
          <Stat icon={<TrendingDown className="h-4 w-4" />} label="Despesas" value={fmtBRL(o.period.expense)} hint={`${fmtBRL(o.period.expensePaid)} pagas`} />
          <Stat icon={<Scale className="h-4 w-4" />} label="Saldo do período" value={fmtBRL(o.period.balance)} accent={o.period.balance >= 0} negative={o.period.balance < 0} />
        </div>
        <p className="mt-2 text-xs text-muted">Inclui sozinho as vendas, as compras de pontos e clube e os custos das vendas (como no Fluxo de Caixa), além do que você lança no Financeiro.</p>
      </section>
      <section aria-label="Resultado do período">
        <h2 className="kicker mb-2">Resultado do período</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat icon={<ReceiptText className="h-4 w-4" />} label="Lucro das vendas" value={fmtBRL(o.result.salesProfit)} hint={`${o.result.salesCount} ${o.result.salesCount === 1 ? "venda" : "vendas"} no mês`} />
          <Stat icon={<TrendingDown className="h-4 w-4" />} label="Despesas operacionais" value={fmtBRL(o.result.operational)} hint="pagas: impostos, pessoal, estrutura..." />
          <Stat icon={<PiggyBank className="h-4 w-4" />} label="Lucro líquido" value={fmtBRL(o.result.net)} hint="o que sobrou da operação" accent={o.result.net >= 0} negative={o.result.net < 0} />
        </div>
        <p className="mt-2 text-xs text-muted">Lucro das vendas menos as despesas pagas que não são custo de emissão. O custo dos pontos de cada venda já está descontado no lucro dela, por isso as categorias &quot;Compra de pontos e milhas&quot; e &quot;Custos da emissão&quot; não entram de novo.</p>
      </section>
      <section aria-label="Balanço patrimonial">
        <h2 className="kicker mb-2">Balanço patrimonial</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat icon={<Landmark className="h-4 w-4" />} label="Ativo" value={fmtBRL(o.balance.assets)} hint={`caixa ${fmtBRL(o.balance.cash)} · milhas ${fmtBRL(o.balance.miles)} · a receber ${fmtBRL(o.balance.receivable)}`} />
          <Stat icon={<TrendingDown className="h-4 w-4" />} label="Passivo" value={fmtBRL(o.balance.payable)} hint={["despesas pendentes", o.balance.toPayBills > 0 ? `${fmtBRL(o.balance.toPayBills)} em faturas de cartão` : "", o.balance.toPayPurchases > 0 ? `${fmtBRL(o.balance.toPayPurchases)} de parcelas a vencer` : ""].filter(Boolean).join(" · ")} />
          <Stat icon={<Wallet className="h-4 w-4" />} label="Patrimônio líquido" value={fmtBRL(o.balance.equity)} accent={o.balance.equity >= 0} negative={o.balance.equity < 0} />
        </div>
        <p className="mt-2 text-xs text-muted">O que você tem (saldo das contas, o custo das milhas em estoque e o que vão te pagar, inclusive as vendas ainda não pagas) menos o que você deve. Não muda com o mês escolhido.</p>
      </section>
      <div className="grid gap-4 lg:grid-cols-3">
        <Breakdown title="Despesas por categoria" items={o.period.expenseByCategory} total={o.period.expense} tone="bg-red-400" />
        <Breakdown title="Receitas por categoria" items={o.period.incomeByCategory} total={o.period.income} tone="bg-emerald-400" />
        <section className="card card-pad" aria-label="Saldo por conta">
          <h2 className="mb-3 font-semibold">Saldo por conta</h2>
          {o.accounts.length === 0 ? <p className="py-4 text-sm text-muted">Nenhuma conta. <Link href="/app/financeiro?aba=contas" className="text-accent-light hover:underline">Cadastrar conta</Link></p> : (
            <ul className="space-y-2 text-sm">
              {o.accounts.map((a) => <li key={a.id} className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: a.color }} aria-hidden /><span className="flex-1 truncate">{a.name}</span><span className={`tabular-nums ${a.balanceCents < 0 ? "text-red-300" : ""}`}>{fmtBRL(a.balanceCents)}</span></li>)}
              <li className="flex justify-between border-t border-line pt-2 font-semibold"><span>Total</span><span className="tabular-nums">{fmtBRL(o.balance.cash)}</span></li>
            </ul>
          )}
        </section>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card card-pad" aria-label="Contas a pagar"><h2 className="mb-2 flex justify-between font-semibold"><span>Contas a pagar</span><span className="tabular-nums text-red-300">{fmtBRL(o.balance.payable - o.balance.toPayPurchases)}</span></h2>{due(o.toPay, "Nenhuma conta a pagar.", "pagar")}{o.balance.toPayBills > 0 && <p className="mt-2 text-xs text-muted"><Link href="/app/financeiro?aba=faturas" className="text-accent-light hover:underline">Ver faturas dos cartões ({fmtBRL(o.balance.toPayBills)} em aberto)</Link></p>}{o.balance.toPayPurchases > 0 && <p className="mt-2 text-xs text-muted"><Link href="/app/financeiro?aba=fluxo" className="text-accent-light hover:underline">+ {fmtBRL(o.balance.toPayPurchases)} de parcelas de compras e custos de emissão a vencer (fora do cartão)</Link></p>}</section>
        <section className="card card-pad" aria-label="Contas a receber"><h2 className="mb-2 flex justify-between font-semibold"><span>Contas a receber</span><span className="tabular-nums text-emerald-300">{fmtBRL(o.balance.receivable - o.balance.toReceiveSales)}</span></h2>{due(o.toReceive, "Nenhuma conta a receber.", "receber")}{o.balance.toReceiveSales > 0 && <p className="mt-2 text-xs text-muted"><Link href="/app/sales?pago=nao&periodo=tudo" className="text-accent-light hover:underline">+ {fmtBRL(o.balance.toReceiveSales)} de vendas ainda não pagas</Link></p>}</section>
      </div>
    </div>
  );
}

async function Cashflow({ userId, month }: { userId: string; month: string }) {
  const { months } = await financeCashflow(userId, month);
  type M = (typeof months)[number];
  type Row = [string, (m: M) => [number | null, number | null], string, boolean?];
  // detalhe de onde vem cada valor (só as origens que têm algo nestes 5 meses)
  const part = (label: string, k: keyof M["parts"]): Row[] => (months.some((m) => m.parts[k].planned !== 0) ? [[label, (m) => [m.parts[k].planned, m.parts[k].done], "", true]] : []);
  const rows: Row[] = [
    ["Receitas", (m) => [m.incomePlanned, m.incomeDone], "text-emerald-300"],
    ...part("Vendas", "sales"),
    ...part("Lançamentos do Financeiro", "manualIncome"),
    ["Despesas", (m) => [m.expensePlanned, m.expenseDone], "text-red-300"],
    ...part("Compras de pontos e clube", "purchases"),
    ...part("Custos das vendas", "saleCosts"),
    ...part("Outros gastos no cartão", "cardOther"),
    ...part("Lançamentos do Financeiro", "manualExpense"),
    ["Saldo do mês", (m) => [m.net, m.incomeDone - m.expenseDone], ""],
    ["Saldo acumulado", (m) => [m.running, null], "font-semibold"],
  ];
  return (
    <div className="space-y-4">
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr><th />{months.map((m) => <th key={m.month} colSpan={2} className={`text-center ${m.month === month ? "text-white" : ""}`}>{short(m.month)}</th>)}</tr>
              <tr><th />{months.map((m) => [<th key={`${m.month}p`} className="text-right text-[11px]">Previsto</th>, <th key={`${m.month}r`} className="text-right text-[11px]">Realizado</th>])}</tr>
            </thead>
            <tbody>
              {rows.map(([label, get, cls, sub], i) => (
                <tr key={`${i}-${label}`} className={sub ? "text-xs text-muted" : ""}>
                  <td className={sub ? "pl-8" : "font-medium"}>{label}</td>
                  {months.map((m) => { const [p, r] = get(m); return [<td key={`${m.month}p`} className={`text-right tabular-nums ${cls}`}>{p == null ? "" : fmtBRL(p)}</td>, <td key={`${m.month}r`} className={`text-right tabular-nums text-muted`}>{r == null ? "" : fmtBRL(r)}</td>]; })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-muted">Previsto = tudo que vence no mês (pago ou não); realizado = o que já foi pago ou recebido. O saldo acumulado parte dos saldos iniciais das contas e soma o previsto mês a mês. Transferências entre contas não entram.</p>
      <p className="text-xs text-muted">Entram sozinhos, sem lançar aqui: as <b>vendas</b> (o que o cliente paga, na data da venda; realizado quando a venda está paga) e o que você pagou nos <b>lançamentos do Extrato</b> (compra de pontos, clube, taxas) e na <b>emissão</b> (taxas repassadas, fornecedor, emissão em dinheiro, comissão). Compra parcelada vira uma parcela por mês (antecipada, tudo no mês da compra) e, no cartão, cai no vencimento da fatura. Para não contar duas vezes, não lance essas compras e vendas de novo no Financeiro.</p>
      <div className="flex items-center gap-2 text-xs text-muted"><Coins className="h-3.5 w-3.5" />Para ver os lançamentos de um mês, troque o mês no topo e abra a aba Lançamentos.</div>
    </div>
  );
}
