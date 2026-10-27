import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PieChart as PieIcon, ShoppingBag, CreditCard, PiggyBank, TrendingUp, HandCoins, Landmark } from "lucide-react";
import { requirePageUser, selectedHolderId, holderScopeLabel } from "@/server/session";
import { listPrograms } from "@/server/services/admin";
import {
  REPORT_TABS, type ReportTab, type ReportFilter, resolvePeriod,
  overviewReport, purchasesReport, cardsReport, savingsReport, evolutionReport, salesReport, assetsReport,
} from "@/server/services/reports";
import { PageHeader, Stat } from "@/components/stat";
import { Donut, MonthlyMoney, MonthlySales, HBar, CreditsDebits, SeriesLines, StackedMonthly, ExpectedVsReceived } from "@/components/charts";
import { fmtBRL, fmtPts, fmtDate } from "@/lib/format";
import { ReportToolbar } from "../client";

// Abas marcadas como recurso dos planos pagos, como na referência (sem bloqueio: não há cobrança nesta instalação)
const PRO_TABS = new Set<ReportTab>(["evolution", "sales", "assets"]);
const NAV: { key: ReportTab; label: string; icon: React.ElementType; tone: string }[] = [
  { key: "overview", label: "Visão Geral", icon: PieIcon, tone: "bg-blue-500/15 text-blue-400" },
  { key: "purchases", label: "Compras", icon: ShoppingBag, tone: "bg-green-500/15 text-green-400" },
  { key: "credit-cards", label: "Cartões", icon: CreditCard, tone: "bg-violet-500/15 text-violet-400" },
  { key: "savings", label: "Economia", icon: PiggyBank, tone: "bg-teal-500/15 text-teal-400" },
  { key: "evolution", label: "Evolução", icon: TrendingUp, tone: "bg-cyan-500/15 text-cyan-400" },
  { key: "sales", label: "Vendas", icon: HandCoins, tone: "bg-orange-500/15 text-orange-400" },
  { key: "assets", label: "Bens e Direitos", icon: Landmark, tone: "bg-amber-500/15 text-amber-400" },
];

function Card({ title, subtitle, children, className = "" }: { title: string; subtitle: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`card card-pad min-w-0 ${className}`}>
      <div className="mb-4 border-b border-line pb-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}
const Empty = ({ text }: { text: string }) => <p className="py-10 text-center text-sm text-muted">{text}</p>;
const cpm = (c: number | null) => (c == null ? "-" : fmtBRL(c));

export default async function ReportPage({ params, searchParams }: { params: Promise<{ tab: string }>; searchParams: Promise<Record<string, string>> }) {
  const tab = (await params).tab as ReportTab;
  if (!REPORT_TABS.includes(tab)) notFound();
  const user = await requirePageUser();
  const sp = await searchParams;
  const holderId = await selectedHolderId(user.id);
  const programs = await listPrograms(false);
  const programId = programs.some((p) => p.id === sp.programa) ? sp.programa : undefined;
  const f: ReportFilter = { userId: user.id, holderId, programId, period: resolvePeriod(sp) };
  const current = NAV.find((n) => n.key === tab)!;
  const exportQs = new URLSearchParams({ ...sp, tab });

  return (
    <>
      <PageHeader title={current.label} subtitle={`Relatórios · ${await holderScopeLabel(holderId)}`} />
      <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-6">
        <nav aria-label="Relatórios" className="-mx-1 mb-4 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:mb-0 lg:flex-col lg:overflow-visible lg:px-0">
          {NAV.map((n) => {
            const on = n.key === tab;
            const q = new URLSearchParams(Object.entries(sp).filter(([k]) => k !== "ano"));
            return (
              <Link
                key={n.key}
                href={`/app/reports/${n.key}${q.size ? `?${q}` : ""}`}
                aria-current={on ? "page" : undefined}
                className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors lg:border-l-2 lg:rounded-l-none ${on ? "bg-panel2 text-white lg:border-accent-light" : "text-zinc-300 hover:bg-panel2/60 lg:border-transparent"}`}
              >
                <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${n.tone}`}><n.icon className="h-4 w-4" /></span>
                {n.label}
                {PRO_TABS.has(n.key) && <span className="ml-auto rounded bg-accent-soft px-1.5 text-[10px] font-bold uppercase text-accent-light" title="Recurso dos planos PRO e Gestor">Pro</span>}
              </Link>
            );
          })}
        </nav>
        <div className="min-w-0">
          <ReportToolbar
            tab={tab}
            sp={sp}
            programs={programs.map((p) => ({ id: p.id, name: p.name }))}
            exportHref={`/api/reports/export?${exportQs}`}
            hidePeriod={tab === "assets"}
          />
          {tab === "overview" && <Overview f={f} />}
          {tab === "purchases" && <Purchases f={f} />}
          {tab === "credit-cards" && <Cards f={f} />}
          {tab === "savings" && <Savings f={f} />}
          {tab === "evolution" && <Evolution f={f} />}
          {tab === "sales" && <Sales f={f} />}
          {tab === "assets" && <Assets f={f} />}
        </div>
      </div>
    </>
  );
}

async function Overview({ f }: { f: ReportFilter }) {
  const r = await overviewReport(f);
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card title="Acúmulo por categoria" subtitle="Distribuição de pontos acumulados por tipo de lançamento">
        <Donut data={r.byCategory} label="Gráfico de acúmulo por categoria" />
      </Card>
      <Card title="Pontos por programa" subtitle="Percentual de pontos acumulados por programa">
        <Donut data={r.byProgram} label="Gráfico de pontos por programa" />
      </Card>
    </div>
  );
}

const ptsOrDash = (n: number) => fmtPts(n);
const cpmOrOrganic = (c: number | null) => (c ? fmtBRL(c) : "Orgânico");
const List = ({ items, empty }: { items: { name: string; value: string; hint?: string; color?: string }[]; empty: string }) =>
  items.length === 0 ? <Empty text={empty} /> : (
    <ul className="divide-y divide-line">
      {items.map((x, i) => (
        <li key={i} className="flex items-center gap-3 py-2.5">
          {x.color && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: x.color }} aria-hidden />}
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{x.name}</span>{x.hint && <span className="block text-xs text-muted">{x.hint}</span>}</span>
          <span className="text-sm font-semibold tabular-nums">{x.value}</span>
        </li>
      ))}
    </ul>
  );

async function Purchases({ f }: { f: ReportFilter }) {
  const r = await purchasesReport(f);
  const none = "Sem dados para exibir";
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Pontos acumulados" value={ptsOrDash(r.totals.points)} hint="no período" />
        <Stat label="Custo extra" value={fmtBRL(r.totals.extraCents)} hint="no período" />
        <Stat label="CPM médio" value={cpmOrOrganic(r.totals.cpmCents)} hint="custo por milheiro" />
        <Stat label="Compras" value={String(r.totals.count)} hint={`${r.totals.partners} ${r.totals.partners === 1 ? "parceiro" : "parceiros"}`} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Pontos por parceiro" subtitle="Distribuição de pontos acumulados por loja parceira">{r.byStore.length ? <Donut data={r.byStore} label="Gráfico de pontos por parceiro" /> : <Empty text={none} />}</Card>
        <Card title="Pontos por programa" subtitle="Pontos de compras acumulados por programa">{r.byProgram.length ? <Donut data={r.byProgram} label="Gráfico de pontos de compras por programa" /> : <Empty text={none} />}</Card>
        <Card title="Pontos por status de compra" subtitle="Pontos no fluxo de acompanhamento, do pedido à finalização">{r.byStatus.length ? <HBar data={r.byStatus} /> : <Empty text={none} />}</Card>
        <Card title="Origem dos pontos de compra" subtitle="Pontos registrados via acompanhamento de compras vs. lançamento direto">{r.origin.length ? <Donut data={r.origin} label="Gráfico da origem dos pontos de compra" /> : <Empty text={none} />}</Card>
        <Card title="Custo extra por categoria" subtitle="Quanto você pagou para acumular pontos em compras, por tipo de custo">{r.byCost.length ? <Donut data={r.byCost} money label="Gráfico do custo extra por categoria" /> : <Empty text="Nenhum custo extra registrado" />}</Card>
        <Card title="Multiplicador médio por parceiro" subtitle="Média ponderada de pontos por real gasto">{r.multiplier.length ? <HBar data={r.multiplier} unit="pts/R$" /> : <Empty text={none} />}</Card>
      </div>
    </div>
  );
}

async function Cards({ f }: { f: ReportFilter }) {
  const r = await cardsReport(f);
  const none = "Sem dados para exibir";
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Pontos recebidos" value={fmtPts(r.totals.receivedPoints)} hint="no período" />
        <Stat label="Total em faturas" value={fmtBRL(r.totals.invoicedCents)} hint={`${r.totals.invoices} ${r.totals.invoices === 1 ? "fatura" : "faturas"} (${r.totals.pending} ${r.totals.pending === 1 ? "pendente" : "pendentes"})`} />
        <Stat label="Anuidade" value={fmtBRL(r.totals.feeCents)} hint="custo no período" />
        <Stat label="Pontos por real" value={r.totals.pointsPerReal.toLocaleString("pt-BR")} hint="média nas faturas recebidas" />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Faturas por status" subtitle="Situação das faturas dos seus cartões no período">{r.byStatus.length ? <Donut data={r.byStatus} unit="faturas" label="Gráfico das faturas por status" /> : <Empty text={none} />}</Card>
        <Card title="Pontos por programa" subtitle="Distribuição dos pontos creditados pelos cartões entre programas">{r.byProgram.length ? <Donut data={r.byProgram} label="Gráfico de pontos dos cartões por programa" /> : <Empty text={none} />}</Card>
        <Card title="Top cartões" subtitle="Cartões que mais geraram pontos no período">
          <List items={r.top.map((c) => ({ name: c.name, color: c.color, value: `${fmtPts(c.points)} pts` }))} empty={none} />
          {r.top.length > 0 && <p className="mt-3 border-t border-line pt-3 text-sm"><b>Total</b> · {fmtPts(r.top.reduce((t, c) => t + c.points, 0))} pts em {fmtBRL(r.top.reduce((t, c) => t + c.invoicedCents, 0))} de faturas</p>}
        </Card>
        <Card title="Pontos previstos vs recebidos" subtitle="Compare o que cada fatura deveria render com o que foi creditado"><ExpectedVsReceived data={r.invoices} /></Card>
        <Card title="Anuidade ao longo do tempo" subtitle="Quanto você pagou de anuidade para manter os pontos dos cartões" className="xl:col-span-2">
          {r.totals.feeCents ? <MonthlyMoney data={r.fees} dataKey="fee" name="Anuidade" /> : <Empty text="Nenhum custo de anuidade registrado no período" />}
        </Card>
      </div>
    </div>
  );
}

async function Savings({ f }: { f: ReportFilter }) {
  const r = await savingsReport(f);
  const none = "Nenhum resgate com valor de referência no período";
  return (
    <div className="space-y-4">
      <Stat label="Total economizado" value={fmtBRL(r.totals.savingCents)} hint={`${r.totals.redemptions} ${r.totals.redemptions === 1 ? "resgate considerado" : "resgates considerados"}`} accent />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Economia por programa" subtitle="Quanto cada programa economizou nos resgates">{r.byProgram.length ? <Donut data={r.byProgram} money label="Gráfico da economia por programa" /> : <Empty text={none} />}</Card>
        <Card title="Economia por categoria" subtitle="Economia por tipo de resgate">{r.byType.length ? <Donut data={r.byType} money label="Gráfico da economia por categoria" /> : <Empty text={none} />}</Card>
      </div>
      <Card title="Detalhamento por resgate" subtitle="Valor em dinheiro informado no débito menos o custo dos pontos e as taxas">
        {r.rows.length === 0 ? <Empty text={none} /> : (
          <div className="-mx-5 overflow-x-auto">
            <table className="table-base">
              <thead><tr><th>Data</th><th>Resgate</th><th className="hidden md:table-cell">Conta</th><th className="text-right">Pontos</th><th className="text-right">Em dinheiro</th><th className="hidden text-right sm:table-cell">Custo</th><th className="text-right">Economia</th></tr></thead>
              <tbody>
                {r.rows.map((x) => (
                  <tr key={x.id}>
                    <td className="whitespace-nowrap tabular-nums">{fmtDate(x.date)}</td>
                    <td><span className="block max-w-[220px] truncate font-medium">{x.description}</span><span className="block text-xs text-muted">{x.type}</span></td>
                    <td className="hidden text-muted md:table-cell">{x.account}</td>
                    <td className="text-right tabular-nums">{fmtPts(x.points)}</td>
                    <td className="text-right tabular-nums">{fmtBRL(x.cashCents)}</td>
                    <td className="hidden text-right tabular-nums text-muted sm:table-cell">{fmtBRL(x.pointsCostCents + x.feesCents)}</td>
                    <td className={`text-right font-semibold tabular-nums ${(x.savingCents ?? 0) >= 0 ? "text-ok" : "text-bad"}`}>{fmtBRL(x.savingCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

async function Evolution({ f }: { f: ReportFilter }) {
  const r = await evolutionReport(f);
  const sign = (n: number) => `${n > 0 ? "+" : ""}${fmtPts(n)}`;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <Stat label="Δ Saldo" value={sign(r.totals.delta)} hint="no período" />
        <Stat label="Créditos" value={fmtPts(r.totals.credits)} hint="no período" />
        <Stat label="Débitos" value={fmtPts(r.totals.debits)} hint="no período" />
      </div>
      <Card title="Evolução do Saldo" subtitle="Acompanhe como seu saldo de pontos evoluiu ao longo do tempo.">
        <SeriesLines series={r.accounts} data={r.points} label="Gráfico da evolução do saldo por conta" />
      </Card>
      <Card title="Créditos vs Débitos" subtitle="Entradas e saídas de pontos ao longo do tempo."><CreditsDebits data={r.flows} /></Card>
      <Card title="Evolução do CPM" subtitle="Acompanhe como o custo por milheiro (CPM) de cada conta evoluiu, pelo custo médio ponderado.">
        <SeriesLines series={r.accounts} data={r.cpm} money label="Gráfico da evolução do CPM por conta" />
      </Card>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Créditos por Categoria" subtitle="Distribuição de pontos creditados por tipo ao longo do tempo.">
          <StackedMonthly series={r.creditCats.series} data={r.creditCats.data} label="Gráfico dos créditos por categoria" empty="Sem dados para o período selecionado" />
        </Card>
        <Card title="Débitos por Categoria" subtitle="Distribuição de pontos debitados por tipo ao longo do tempo.">
          <StackedMonthly series={r.debitCats.series} data={r.debitCats.data} label="Gráfico dos débitos por categoria" empty="Sem dados para o período selecionado" />
        </Card>
      </div>
    </div>
  );
}

async function Sales({ f }: { f: ReportFilter }) {
  const r = await salesReport(f);
  const none = "Sem dados para exibir";
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Receita" value={fmtBRL(r.totals.revenueCents)} hint="no período" />
        <Stat label="Lucro" value={fmtBRL(r.totals.profitCents)} hint="no período" accent />
        <Stat label="Margem" value={`${r.totals.marginPct.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`} hint="média no período" />
        <Stat label="Pontos vendidos" value={fmtPts(r.totals.points)} hint={`${r.totals.count} ${r.totals.count === 1 ? "venda" : "vendas"}`} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Vendas por programa" subtitle="Número de vendas realizadas por programa">{r.count.length ? <HBar data={r.count} unit="vendas" /> : <Empty text={none} />}</Card>
        <Card title="Receita por programa" subtitle="Distribuição de receita de vendas por programa">{r.revenue.length ? <Donut data={r.revenue} money label="Gráfico da receita por programa" /> : <Empty text={none} />}</Card>
        <Card title="Lucro por programa" subtitle="Distribuição de lucro por programa">
          <List items={r.profit.map((p) => ({ name: p.name, color: p.color, value: fmtBRL(p.value) }))} empty={none} />
        </Card>
        <Card title="Top beneficiários" subtitle="Principais beneficiários por receita no período">
          <List items={r.beneficiaries.map((b) => ({ name: b.name, hint: `${b.count} ${b.count === 1 ? "venda" : "vendas"}`, value: fmtBRL(b.value) }))} empty="Sem dados para o período selecionado" />
        </Card>
      </div>
      <Card title="Evolução de vendas" subtitle="Receita e lucro de vendas ao longo do tempo.">
        {r.totals.count ? <MonthlySales data={r.monthly} /> : <Empty text="Sem dados para o período selecionado" />}
      </Card>
    </div>
  );
}

async function Assets({ f }: { f: ReportFilter }) {
  const r = await assetsReport(f);
  return (
    <section className="card min-w-0 overflow-hidden" aria-label="Bens e Direitos">
      <div className="border-b border-line px-5 py-4">
        <h2 className="text-lg font-semibold">Posição patrimonial em 31/12 de cada ano</h2>
        <p className="text-sm text-muted">Saldo, CPM e custo de aquisição de cada conta: a base para a ficha “Bens e Direitos” do Imposto de Renda.</p>
      </div>
      {r.rows.length === 0 ? <Empty text="Nenhuma conta com lançamentos." /> : (
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th rowSpan={2}>Programa</th>
                {r.cuts.map((c) => <th key={c.key} colSpan={3} className="border-l border-line text-center">{c.label}</th>)}
              </tr>
              <tr>
                {r.cuts.map((c) => (
                  <Fragment key={c.key}>
                    <th className="border-l border-line text-right">Saldo</th><th className="text-right">CPM</th><th className="text-right">Custo de Aquisição</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {r.rows.map((x) => (
                <tr key={x.id}>
                  <td><span className="flex items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: x.color }} aria-hidden /><span className="truncate font-medium">{x.account}</span></span></td>
                  {x.cells.map((c, i) => (
                    <Fragment key={i}>
                      <td className="border-l border-line text-right tabular-nums">{fmtPts(c.points)}</td>
                      <td className="text-right tabular-nums">{fmtBRL(c.cpmCents)}</td>
                      <td className="text-right tabular-nums">{fmtBRL(c.costCents)}</td>
                    </Fragment>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td>Total</td>
                {r.totals.map((t, i) => (
                  <Fragment key={i}>
                    <td className="border-l border-line text-right tabular-nums">{fmtPts(t.points)}</td>
                    <td className="text-right tabular-nums">{fmtBRL(t.cpmCents)}</td>
                    <td className="text-right tabular-nums">{fmtBRL(t.costCents)}</td>
                  </Fragment>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="border-t border-line px-5 py-3 text-xs text-muted">Valores informativos, calculados a partir dos lançamentos que você registrou. Confirme com seu contador antes de usar na declaração do Imposto de Renda.</p>
    </section>
  );
}
