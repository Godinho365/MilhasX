import Link from "next/link";
import {
  TrendingUp, Wallet, DollarSign, Percent, Receipt, Clock, CheckCircle2, Coins, Landmark, Layers, Activity, CalendarDays, CreditCard, XCircle,
  Users, UserRound, PieChart as PieIcon, Crown, Target, Info,
} from "lucide-react";
import { requirePageUser, selectedHolderId } from "@/server/session";
import { salesMetrics, teamMetrics, accountMetrics, metricsHidden } from "@/server/services/metrics";
import { METRICS_TABS, growthPct, type MetricsTab } from "@/domain/metrics";
import { DailyMoney, HBar, Donut } from "@/components/charts";
import { fmtBRL, fmtPts, fmtDate } from "@/lib/format";
import { MetricsHeader } from "./client";

// Métricas (Menu principal): os números do mês em três abas — Vendas, Equipe e Contas.
type SP = Record<string, string>;

const pctFmt = (n: number | null | undefined) => (n == null ? "—" : `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
const num1 = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

/** Variação em relação ao período anterior: % para valores, pontos percentuais para taxas. */
type Delta = { kind: "pct" | "pp"; now: number | null; prev: number | null; better: "up" | "down" | "none" };
function DeltaBadge({ d }: { d: Delta }) {
  if (d.now == null || d.prev == null) return null;
  const v = d.kind === "pct" ? growthPct(d.now, d.prev) : Math.round((d.now - d.prev) * 10) / 10;
  if (v == null || v === 0) return null;
  const good = d.better === "none" ? null : (v > 0) === (d.better === "up");
  const tone = good == null ? "text-muted" : good ? "text-emerald-400" : "text-red-400";
  return <span className={`text-xs font-medium tabular-nums ${tone}`} title="em relação ao período anterior">{v > 0 ? "▲" : "▼"} {num1(Math.abs(v))}{d.kind === "pct" ? "%" : " p.p."}</span>;
}

function Kpi({ label, value, hint, icon: I, delta, negative }: { label: string; value: string; hint: React.ReactNode; icon: typeof TrendingUp; delta?: Delta; negative?: boolean }) {
  return (
    <div className="card card-pad min-w-0">
      <div className="flex items-start gap-2">
        <p className="text-sm text-muted">{label}</p>
        <I className="ml-auto h-4 w-4 shrink-0 text-muted" aria-hidden />
      </div>
      <p className={`mt-2 truncate text-2xl font-semibold tabular-nums tracking-tight ${negative ? "text-red-400" : ""}`}>{value}</p>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted"><span>{hint}</span>{delta && <DeltaBadge d={delta} />}</div>
    </div>
  );
}

function Block({ title, subtitle, children, action, className = "" }: { title: string; subtitle: string; children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <section className={`card card-pad min-w-0 ${className}`}>
      <div className="mb-4 flex items-start gap-3 border-b border-line pb-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted">{subtitle}</p>
        </div>
        {action && <div className="ml-auto shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}
const Empty = ({ title, text }: { title: string; text: string }) => (
  <div className="py-10 text-center"><p className="text-sm font-medium">{title}</p><p className="mt-1 text-sm text-muted">{text}</p></div>
);
const Bar = ({ value, color = "rgb(var(--accent))" }: { value: number; color?: string }) => (
  <div className="h-2 w-full overflow-hidden rounded-full bg-panel2"><div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, value))}%`, backgroundColor: color }} /></div>
);
const grid = "grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6";

export default async function MetricsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const tab: MetricsTab = (METRICS_TABS as readonly string[]).includes(sp.aba ?? "") ? (sp.aba as MetricsTab) : "vendas";
  const [holderId, hidden] = await Promise.all([selectedHolderId(user.id), metricsHidden(user.actor.id)]);
  const show = (k: string) => !hidden.includes(k);
  const scope = { month: sp.mes, holderId };

  if (tab === "equipe") {
    const m = await teamMetrics(user.id, { ...scope, memberId: sp.membro });
    return <><MetricsHeader tab={tab} sp={sp} window={m.window} hidden={hidden} filters={{ members: m.members }} /><TeamTab m={m} show={show} /></>;
  }
  if (tab === "contas") {
    const m = await accountMetrics(user.id, { ...scope, programId: sp.programa });
    return <><MetricsHeader tab={tab} sp={sp} window={m.window} hidden={hidden} filters={{ programs: m.programOptions }} /><AccountsTab m={m} show={show} /></>;
  }
  const m = await salesMetrics(user.id, { ...scope, customerId: sp.cliente, tag: sp.etiqueta });
  return <><MetricsHeader tab={tab} sp={sp} window={m.window} hidden={hidden} filters={{ customers: m.filters.customers, tags: m.filters.tags }} /><SalesTab m={m} show={show} /></>;
}

/* ---------------- Vendas ---------------- */

function SalesTab({ m, show }: { m: Awaited<ReturnType<typeof salesMetrics>>; show: (k: string) => boolean }) {
  const k = m.kpis, p = m.prev, w = m.window;
  const d = (now: number | null, prev: number | null, better: Delta["better"] = "up", kind: Delta["kind"] = "pct"): Delta => ({ kind, now, prev, better });
  const growth = growthPct(k.revenueCents, p.revenueCents);
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">{fmtDate(w.from)} – {fmtDate(w.to)} · comparando com {fmtDate(w.prevFrom)} – {fmtDate(w.prevTo)}</p>
      {show("vendas.cards") && (
        <div className={grid}>
          <Kpi label="Lucro" value={fmtBRL(k.profitCents)} hint="lucro das vendas" icon={TrendingUp} delta={d(k.profitCents, p.profitCents)} negative={k.profitCents < 0} />
          <Kpi label="Lucro líquido" value={fmtBRL(k.netProfitCents)} hint={<>lucro − <Link href="/app/financeiro" className="hover:underline">despesas</Link> {fmtBRL(k.expensesCents)}</>} icon={Wallet} delta={d(k.netProfitCents, p.netProfitCents)} negative={k.netProfitCents < 0} />
          <Kpi label="Total vendido" value={fmtBRL(k.revenueCents)} hint={`${k.count} ${k.count === 1 ? "venda" : "vendas"}`} icon={DollarSign} delta={d(k.revenueCents, p.revenueCents)} />
          <Kpi label="Margem" value={pctFmt(k.marginPct)} hint="lucro sobre o valor cobrado" icon={Percent} delta={d(k.marginPct, p.marginPct, "up", "pp")} />
          <Kpi label="Ticket médio" value={fmtBRL(k.ticketCents)} hint="valor médio por venda" icon={Receipt} delta={d(k.ticketCents, p.ticketCents)} />
          <Kpi label="Total a receber" value={fmtBRL(k.receivableCents)} hint="vendas do período sem pagamento" icon={Clock} delta={d(k.receivableCents, p.receivableCents, "down")} />
          <Kpi label="Total recebido" value={fmtBRL(k.receivedCents)} hint="vendas do período já pagas" icon={CheckCircle2} delta={d(k.receivedCents, p.receivedCents)} />
          <Kpi label="Custo das milhas" value={fmtBRL(k.milesCostCents)} hint="custo dos pontos usados" icon={Coins} delta={d(k.milesCostCents, p.milesCostCents, "none")} />
          <Kpi label="Total em taxas" value={fmtBRL(k.feesCents)} hint="taxas e custos repassados ao cliente" icon={Landmark} delta={d(k.feesCents, p.feesCents, "none")} />
          <Kpi label="Custo total" value={fmtBRL(k.costCents)} hint="milhas + taxas + pago em dinheiro" icon={Layers} delta={d(k.costCents, p.costCents, "none")} />
          <Kpi label="Taxa de crescimento" value={pctFmt(growth)} hint="do faturamento vs período anterior" icon={Activity} negative={(growth ?? 0) < 0} />
          <Kpi label="Média diária" value={k.count > 0 && k.dailyAvg === 0 ? "< 0,1" : num1(k.dailyAvg)} hint="vendas por dia" icon={CalendarDays} delta={d(k.dailyAvg, p.dailyAvg)} />
          <Kpi label="IOF" value={fmtBRL(k.iofCents)} hint={`${pctFmt(k.iofPct ?? 0)} do faturamento`} icon={CreditCard} delta={d(k.iofCents, p.iofCents, "none")} />
          <Kpi label="Taxa de cancelamento" value={pctFmt(k.cancelPct ?? 0)} hint="vendas reembolsadas no período" icon={XCircle} delta={d(k.cancelPct, p.cancelPct, "down", "pp")} />
        </div>
      )}
      {show("vendas.evolucao") && (
        <Block title="Evolução diária" subtitle="Faturamento e lucro de cada dia do período.">
          <DailyMoney data={m.daily} empty="Nenhuma venda no período escolhido." />
        </Block>
      )}
      <div className="grid gap-4 xl:grid-cols-2">
        {show("vendas.mix") && (
          <Block title="Mix de produtos" subtitle="Quanto cada produto representa da venda e se o que mais fatura é o que mais dá lucro.">
            {m.mix.length === 0 ? <Empty title="Sem produtos no período" text="Nenhuma venda com valor no período escolhido." /> : (
              <div className="space-y-3">
                {m.mix.map((r) => (
                  <div key={r.kind}>
                    <div className="mb-1 flex flex-wrap items-baseline gap-x-3 text-sm">
                      <span className="font-medium">{r.label}</span>
                      <span className="text-xs text-muted">{r.count} {r.count === 1 ? "item" : "itens"}</span>
                      <span className="ml-auto tabular-nums">{fmtBRL(r.revenueCents)} <span className="text-xs text-muted">({pctFmt(r.revenueShare)})</span></span>
                    </div>
                    <Bar value={r.revenueShare} />
                    <p className="mt-1 text-xs text-muted">Lucro {fmtBRL(r.profitCents)} · {pctFmt(r.profitShare)} do lucro · margem {pctFmt(r.marginPct)}</p>
                  </div>
                ))}
              </div>
            )}
          </Block>
        )}
        {show("vendas.recebivel") && (
          <Block title="Saúde do recebível" subtitle="Tudo o que ainda não foi recebido, de qualquer mês, por há quanto tempo a venda está em aberto."
            action={m.aging.count > 0 ? <Link href="/app/sales?pago=nao" className="btn-ghost h-8 border border-line text-xs">Ver vendas</Link> : undefined}>
            {m.aging.count === 0 ? <Empty title="Nada em aberto" text="Não há vendas com pagamento pendente." /> : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-baseline gap-x-4">
                  <p className="text-2xl font-semibold tabular-nums">{fmtBRL(m.aging.totalCents)}</p>
                  <p className="text-sm text-muted">{m.aging.count} {m.aging.count === 1 ? "venda" : "vendas"} · a mais antiga há {m.aging.oldestDays} {m.aging.oldestDays === 1 ? "dia" : "dias"}</p>
                </div>
                {m.aging.buckets.map((b, i) => (
                  <div key={b.key}>
                    <div className="mb-1 flex text-sm"><span>{b.label}</span><span className="ml-auto tabular-nums">{fmtBRL(b.cents)} <span className="text-xs text-muted">· {b.count}</span></span></div>
                    <Bar value={m.aging.totalCents ? (b.cents / m.aging.totalCents) * 100 : 0} color={["#22c55e", "#84cc16", "#f59e0b", "#f97316", "#ef4444"][i]} />
                  </div>
                ))}
                {m.aging.overdue30Cents > 0 && <p className="text-xs text-amber-300">{fmtBRL(m.aging.overdue30Cents)} estão em aberto há mais de 30 dias.</p>}
              </div>
            )}
          </Block>
        )}
        {show("vendas.carteira") && (
          <Block title="Carteira de clientes" subtitle="Quanto do faturamento veio de cliente novo, de quem já comprava e o peso dos maiores.">
            {m.portfolio.customers === 0 && !m.portfolio.noCustomerCents ? <Empty title="Sem clientes no período" text="Nenhuma venda ligada a cliente no período escolhido." /> : (() => {
              const t = m.portfolio.newCents + m.portfolio.returningCents + m.portfolio.noCustomerCents || 1;
              const parts = [
                { label: "Clientes novos", cents: m.portfolio.newCents, n: m.portfolio.newCount, color: "#60a5fa" },
                { label: "Já compravam", cents: m.portfolio.returningCents, n: m.portfolio.returningCount, color: "#4ade80" },
                { label: "Sem cliente", cents: m.portfolio.noCustomerCents, n: null, color: "#71717a" },
              ];
              return (
                <div className="space-y-4">
                  <div className="flex h-3 w-full overflow-hidden rounded-full bg-panel2">{parts.map((x) => <div key={x.label} style={{ width: `${(x.cents / t) * 100}%`, backgroundColor: x.color }} title={x.label} />)}</div>
                  <ul className="grid gap-2 sm:grid-cols-3">
                    {parts.map((x) => (
                      <li key={x.label} className="rounded-xl border border-line p-3">
                        <p className="flex items-center gap-1.5 text-xs text-muted"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: x.color }} />{x.label}</p>
                        <p className="mt-1 font-semibold tabular-nums">{fmtBRL(x.cents)}</p>
                        <p className="text-xs text-muted">{pctFmt(Math.round((x.cents / t) * 1000) / 10)}{x.n != null ? ` · ${x.n} ${x.n === 1 ? "cliente" : "clientes"}` : ""}</p>
                      </li>
                    ))}
                  </ul>
                  <p className="text-sm text-muted">Os 3 maiores clientes somam <span className="font-medium text-zinc-100">{pctFmt(m.portfolio.top3Pct ?? 0)}</span> do faturamento.</p>
                </div>
              );
            })()}
          </Block>
        )}
        {show("vendas.cotacao") && (
          <Block title="Cotação → emissão" subtitle="Dos pedidos criados no CRM no período, quantos viraram emissão e quanto ficou na mesa."
            action={<Link href="/app/crm" className="btn-ghost h-8 border border-line text-xs">Abrir o CRM</Link>}>
            {m.conversion.total === 0 ? <Empty title="Sem cotações no período" text="Nenhum pedido foi criado no CRM Passagens no período escolhido." /> : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-baseline gap-x-4">
                  <p className="text-2xl font-semibold tabular-nums">{pctFmt(m.conversion.conversionPct ?? 0)}</p>
                  <p className="text-sm text-muted">de conversão · {m.conversion.issued} de {m.conversion.total} {m.conversion.total === 1 ? "pedido" : "pedidos"} emitidos</p>
                </div>
                <ul className="grid gap-2 sm:grid-cols-3">
                  <li className="rounded-xl border border-line p-3"><p className="text-xs text-muted">Emitidos</p><p className="mt-1 font-semibold tabular-nums">{m.conversion.issued}</p><p className="text-xs text-muted">{fmtBRL(m.conversion.issuedCents)} em propostas</p></li>
                  <li className="rounded-xl border border-line p-3"><p className="text-xs text-muted">Em aberto</p><p className="mt-1 font-semibold tabular-nums">{m.conversion.open}</p><p className="text-xs text-muted">ainda no funil</p></li>
                  <li className="rounded-xl border border-line p-3"><p className="text-xs text-muted">Perdidos</p><p className="mt-1 font-semibold tabular-nums">{m.conversion.lost}</p><p className="text-xs text-muted">{fmtBRL(m.conversion.lostCents)} na mesa</p></li>
                </ul>
                <p className="text-xs text-muted">Emitido = pedido com reserva ou localizador. Perdido = pedido arquivado. O valor vem da cotação enviada (Pix ou cartão) ou do orçamento do cliente.</p>
              </div>
            )}
          </Block>
        )}
        {show("vendas.clientes") && (
          <Block title="Top 5 clientes" subtitle="Quem mais comprou no período (venda com vários clientes é dividida entre eles).">
            {m.topCustomers.length === 0 ? <Empty title="Sem clientes no período" text="Ligue os clientes nas vendas para ver quem mais compra." /> : (
              <ol className="space-y-2">
                {m.topCustomers.map((c, i) => (
                  <li key={c.id} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-panel2 text-xs font-semibold">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                    <span className="text-xs text-muted">{c.count} {c.count === 1 ? "venda" : "vendas"}</span>
                    <span className="tabular-nums">{fmtBRL(c.revenueCents)}</span>
                  </li>
                ))}
              </ol>
            )}
          </Block>
        )}
        {show("vendas.etiquetas") && (
          <Block title="Top 5 etiquetas" subtitle="As etiquetas mais usadas nas vendas do período.">
            {m.topTags.length === 0 ? <Empty title="Sem etiquetas no período" text="Use etiquetas nas vendas (urgente, agência X...) para comparar grupos." /> : (
              <ol className="space-y-2">
                {m.topTags.map((t) => (
                  <li key={t.tag} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2">
                    <span className="rounded-full border border-line px-2 py-0.5 text-xs">{t.tag}</span>
                    <span className="ml-auto text-xs text-muted">{t.count} {t.count === 1 ? "venda" : "vendas"}</span>
                    <span className="tabular-nums">{fmtBRL(t.revenueCents)}</span>
                  </li>
                ))}
              </ol>
            )}
          </Block>
        )}
      </div>
    </div>
  );
}

/* ---------------- Equipe ---------------- */

function TeamTab({ m, show }: { m: Awaited<ReturnType<typeof teamMetrics>>; show: (k: string) => boolean }) {
  const k = m.kpis, p = m.prev, w = m.window;
  const d = (now: number | null, prev: number | null, better: Delta["better"] = "up", kind: Delta["kind"] = "pct"): Delta => ({ kind, now, prev, better });
  if (m.members.length === 0) {
    return <div className="card card-pad"><Empty title="Nenhum membro na equipe" text="Cadastre quem emite em Gestão › Equipe e marque o emissor em cada venda." /><div className="pb-4 text-center"><Link href="/app/equipe" className="btn-primary">Cadastrar a equipe</Link></div></div>;
  }
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">{fmtDate(w.from)} – {fmtDate(w.to)} · comparando com {fmtDate(w.prevFrom)} – {fmtDate(w.prevTo)}</p>
      {k.withoutIssuer > 0 && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{k.withoutIssuer} {k.withoutIssuer === 1 ? "venda do período está" : "vendas do período estão"} sem emissor e não {k.withoutIssuer === 1 ? "entra" : "entram"} nesta aba. Marque quem emitiu em <Link href="/app/sales" className="underline">Vendas</Link>, no menu ⋯ da venda › Emissores.</span>
        </p>
      )}
      {show("equipe.cards") && (
        <div className={grid}>
          <Kpi label="Total vendido" value={fmtBRL(k.revenueCents)} hint="pela equipe" icon={DollarSign} delta={d(k.revenueCents, p.revenueCents)} />
          <Kpi label="Ticket médio" value={fmtBRL(k.ticketCents)} hint="por emissão" icon={Receipt} delta={d(k.ticketCents, p.ticketCents)} />
          <Kpi label="Margem" value={pctFmt(k.marginPct)} hint="da equipe" icon={Percent} delta={d(k.marginPct, p.marginPct, "up", "pp")} />
          <Kpi label="Emissores" value={String(k.issuers)} hint="com vendas no período" icon={Users} delta={d(k.issuers, p.issuers)} />
          <Kpi label="Média de emissões" value={num1(k.avgIssues)} hint="por emissor" icon={Activity} delta={d(k.avgIssues, p.avgIssues)} />
          <Kpi label="Média de lucro" value={fmtBRL(k.avgProfitCents)} hint="por emissor" icon={TrendingUp} delta={d(k.avgProfitCents, p.avgProfitCents)} />
          <Kpi label="Concentração top 3" value={pctFmt(k.top3Pct ?? 0)} hint="do faturamento nos 3 maiores" icon={Crown} />
        </div>
      )}
      <div className="grid gap-4 xl:grid-cols-2">
        {show("equipe.evolucao") && (
          <Block title="Evolução diária da equipe" subtitle="Vendas e lucro do time ao longo do período.">
            <DailyMoney data={m.daily} empty="Nenhuma venda com emissor no período." labels={{ revenue: "Vendas", profit: "Lucro" }} />
          </Block>
        )}
        {show("equipe.ranking") && (
          <Block title="Ranking de emissores" subtitle="Os 10 que mais deram lucro. Venda com mais de um emissor é dividida em partes iguais.">
            {m.rows.filter((r) => r.issues > 0).length === 0 ? <Empty title="Nenhum emissor com resultado" text="Marque o emissor nas vendas do período." /> : (
              <HBar money data={m.rows.filter((r) => r.issues > 0).slice(0, 10).map((r) => ({ name: r.name, value: r.profitCents, color: r.color }))} />
            )}
          </Block>
        )}
      </div>
      {show("equipe.tabela") && (
        <Block title="Resultado por emissor" subtitle="Vendas, lucro e margem de cada emissor no período.">
          {m.rows.length === 0 ? <Empty title="Nenhum emissor com resultado no período" text="Marque o emissor nas vendas para ver as métricas por pessoa." /> : (
            <div className="-mx-1 overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="text-left text-xs text-muted"><tr>
                  <th className="px-2 py-2 font-medium">Emissor</th><th className="px-2 py-2 text-right font-medium">Emissões</th><th className="px-2 py-2 text-right font-medium">Total vendido</th>
                  <th className="px-2 py-2 text-right font-medium">Ticket médio</th><th className="px-2 py-2 text-right font-medium">Lucro</th><th className="px-2 py-2 text-right font-medium">Lucro médio</th>
                  <th className="px-2 py-2 text-right font-medium">Margem</th><th className="px-2 py-2 text-right font-medium">Variação do lucro</th>
                </tr></thead>
                <tbody>
                  {m.rows.map((r) => (
                    <tr key={r.id} className="border-t border-line">
                      <td className="px-2 py-2"><span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: r.color }} />{r.name}</span></td>
                      <td className="px-2 py-2 text-right tabular-nums">{num1(r.issues)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{fmtBRL(r.revenueCents)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{fmtBRL(r.ticketCents)}</td>
                      <td className={`px-2 py-2 text-right tabular-nums ${r.profitCents < 0 ? "text-red-400" : ""}`}>{fmtBRL(r.profitCents)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{fmtBRL(r.avgProfitCents)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{pctFmt(r.marginPct)}</td>
                      <td className="px-2 py-2 text-right"><DeltaBadge d={{ kind: "pct", now: r.profitCents, prev: r.prevProfitCents, better: "up" }} />{!r.prevProfitCents && <span className="text-xs text-muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Block>
      )}
    </div>
  );
}

/* ---------------- Contas ---------------- */

function AccountsTab({ m, show }: { m: Awaited<ReturnType<typeof accountMetrics>>; show: (k: string) => boolean }) {
  const k = m.kpis;
  if (k.accounts === 0) {
    return <div className="card card-pad"><Empty title="Nenhuma conta cadastrada" text="Cadastre as contas de milhas na Central de Contas para ver onde está o seu capital." /><div className="pb-4 text-center"><Link href="/app/programs" className="btn-primary">Abrir a Central de Contas</Link></div></div>;
  }
  const withSales = m.programs.filter((p) => p.revenueCents || p.profitCents);
  const withCpf = m.programs.filter((p) => p.cpfPct != null);
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">Saldo, custo e valor de mercado são de hoje. Lucro, vendas e rendimento são das vendas com as próprias contas em {m.window.label.toLowerCase()}.</p>
      {show("contas.cards") && (
        <div className={grid}>
          <Kpi label="Lucro consolidado" value={fmtBRL(k.profitCents)} hint="vendas com as suas contas" icon={TrendingUp} negative={k.profitCents < 0} />
          <Kpi label="Total vendido" value={fmtBRL(k.revenueCents)} hint="vendas com as suas contas" icon={DollarSign} />
          <Kpi label="Rendimento" value={pctFmt(k.marginPct)} hint="margem dessas vendas" icon={Percent} />
          <Kpi label="Total investido" value={fmtBRL(k.investedCents)} hint="custo do saldo atual" icon={Wallet} />
          <Kpi label="Valor de mercado" value={k.projectedCents == null ? "—" : fmtBRL(k.projectedCents)} hint={k.projectedCents == null ? "programas sem valor de mercado" : "saldo × valor do milheiro"} icon={Target} />
          <Kpi label="Lucro projetado" value={k.projectedProfitCents == null ? "—" : fmtBRL(k.projectedProfitCents)} hint="valor de mercado − investido" icon={Activity} negative={(k.projectedProfitCents ?? 0) < 0} />
          <Kpi label="Rendimento projetado" value={pctFmt(k.projectedPct)} hint="sobre o valor investido" icon={PieIcon} negative={(k.projectedPct ?? 0) < 0} />
          <Kpi label="Contas" value={String(k.accounts)} hint="contas ativas" icon={UserRound} />
          <Kpi label="Contas com clube" value={String(k.clubAccounts)} hint="clube ativo" icon={Crown} />
        </div>
      )}
      {k.unpricedAccounts > 0 && <p className="text-xs text-muted">{k.unpricedAccounts} {k.unpricedAccounts === 1 ? "conta com saldo fica" : "contas com saldo ficam"} fora do valor de mercado porque o programa não tem valor do milheiro cadastrado.</p>}
      <div className="grid gap-4 xl:grid-cols-2">
        {show("contas.ranking") && (
          <Block title="Ranking de programas" subtitle="Onde o capital está: custo do saldo de cada programa.">
            <HBar money data={m.programs.filter((p) => p.investedCents > 0).map((p) => ({ name: p.name, value: p.investedCents, color: p.color }))} />
          </Block>
        )}
        {show("contas.cpm") && (
          <Block title="CPM pago × CPM de mercado" subtitle="A distância entre o que você pagou por mil milhas e o valor de mercado é a folga para vender.">
            {m.programs.filter((p) => p.paidCpmCents != null).length === 0 ? <Empty title="Sem saldo com custo" text="Lance compras e transferências com custo para ver o CPM pago." /> : (
              <div className="space-y-3">
                {m.programs.filter((p) => p.paidCpmCents != null).map((p) => {
                  const max = Math.max(p.paidCpmCents ?? 0, p.marketCpmCents ?? 0) || 1;
                  const gap = p.marketCpmCents != null && p.paidCpmCents != null ? p.marketCpmCents - p.paidCpmCents : null;
                  return (
                    <div key={p.programId}>
                      <div className="mb-1 flex text-sm"><span className="font-medium">{p.name}</span>{gap != null && <span className={`ml-auto text-xs ${gap < 0 ? "text-red-400" : "text-emerald-400"}`}>folga {fmtBRL(gap)}</span>}</div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-xs"><span className="w-14 text-muted">Pago</span><div className="flex-1"><Bar value={((p.paidCpmCents ?? 0) / max) * 100} color="#f59e0b" /></div><span className="w-20 text-right tabular-nums">{fmtBRL(p.paidCpmCents)}</span></div>
                        <div className="flex items-center gap-2 text-xs"><span className="w-14 text-muted">Mercado</span><div className="flex-1"><Bar value={((p.marketCpmCents ?? 0) / max) * 100} color="#22c55e" /></div><span className="w-20 text-right tabular-nums">{p.marketCpmCents == null ? "—" : fmtBRL(p.marketCpmCents)}</span></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Block>
        )}
        {show("contas.cota") && (
          <Block title="Uso da cota de CPF" subtitle="Quanto da cota de beneficiários já foi usada. Perto de 100%, o programa deixa de servir para emitir, mesmo com saldo.">
            {withCpf.length === 0 ? <Empty title="Sem cota cadastrada" text="Os programas com limite de beneficiários aparecem aqui." /> : (
              <div className="space-y-3">
                {withCpf.map((p) => (
                  <div key={p.programId}>
                    <div className="mb-1 flex text-sm"><span className="font-medium">{p.name}</span><span className="ml-auto tabular-nums">{p.cpfPct}%</span></div>
                    <Bar value={p.cpfPct ?? 0} color={(p.cpfPct ?? 0) >= 90 ? "#ef4444" : (p.cpfPct ?? 0) >= 70 ? "#f59e0b" : "#22c55e"} />
                    <p className="mt-1 text-xs text-muted">{p.cpfUsed} de {p.cpfLimit} CPFs usados</p>
                  </div>
                ))}
              </div>
            )}
          </Block>
        )}
        {show("contas.distribuicao") && (
          <Block title="Distribuição do investimento" subtitle="Quanto do capital investido está em cada programa.">
            <Donut money label="Distribuição do investimento por programa" data={m.programs.filter((p) => p.investedCents > 0).map((p) => ({ name: p.name, value: p.investedCents, color: p.color }))} />
          </Block>
        )}
        {show("contas.roi") && (
          <Block title="ROI por programa" subtitle="Lucro das vendas do período sobre o custo das milhas usadas nelas.">
            {withSales.length === 0 ? <Empty title="Nenhum dado de ROI" text="Nenhuma venda com as suas contas no período." /> : (
              <ul className="space-y-2">
                {withSales.sort((a, b) => (b.roiPct ?? -Infinity) - (a.roiPct ?? -Infinity)).map((p) => (
                  <li key={p.programId} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2 text-sm">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                    <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                    <span className="text-xs text-muted">lucro {fmtBRL(p.profitCents)}</span>
                    <span className={`w-16 text-right font-semibold tabular-nums ${(p.roiPct ?? 0) < 0 ? "text-red-400" : "text-emerald-400"}`}>{pctFmt(p.roiPct)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Block>
        )}
      </div>
      {show("contas.compilado") && (
        <Block title="Compilado por programa" subtitle="Os números de cada programa lado a lado.">
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="text-left text-xs text-muted"><tr>
                <th className="px-2 py-2 font-medium">Programa</th><th className="px-2 py-2 text-right font-medium">Contas</th><th className="px-2 py-2 text-right font-medium">Saldo</th>
                <th className="px-2 py-2 text-right font-medium">CPM pago</th><th className="px-2 py-2 text-right font-medium">Investido</th><th className="px-2 py-2 text-right font-medium">Total vendido</th>
                <th className="px-2 py-2 text-right font-medium">Lucro</th><th className="px-2 py-2 text-right font-medium">Rendimento</th>
              </tr></thead>
              <tbody>
                {m.programs.map((p) => (
                  <tr key={p.programId} className="border-t border-line">
                    <td className="px-2 py-2"><span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.color }} />{p.name}</span></td>
                    <td className="px-2 py-2 text-right tabular-nums">{p.accounts}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{fmtPts(p.balance)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{fmtBRL(p.paidCpmCents)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{fmtBRL(p.investedCents)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{fmtBRL(p.revenueCents)}</td>
                    <td className={`px-2 py-2 text-right tabular-nums ${p.profitCents < 0 ? "text-red-400" : ""}`}>{fmtBRL(p.profitCents)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{pctFmt(p.marginPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Block>
      )}
    </div>
  );
}

