import Link from "next/link";
import { Activity, AlertTriangle, BadgeDollarSign, CalendarClock, Download, Mail, Repeat, ShieldAlert, TrendingUp, UserPlus, Users } from "lucide-react";
import { adminDashboard } from "@/server/services/admin-dashboard";
import { PERIODS, parsePeriod } from "@/domain/admin-metrics";
import { PLANS } from "@/domain/plans";
import { PageHeader } from "@/components/stat";
import { Segmented } from "@/components/ui";
import { CountSeries, Donut, HBar } from "@/components/charts";
import { fmtBRL, fmtPts, fmtDateTime, fmtDay } from "@/lib/format";
import { DeltaBadge, Kpi, Panel, Pill, Section } from "./dashboard-ui";

const pct = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const userHref = (email: string) => (email ? `/admin/users?q=${encodeURIComponent(email)}` : "/admin/users");
const KIND = {
  request: { label: "Pedido de plano", tone: "blue" },
  paused: { label: "Pausada", tone: "red" },
  trial: { label: "Fim do teste", tone: "amber" },
  renewal: { label: "Renovação", tone: "green" },
} as const;

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const period = parsePeriod((await searchParams).p);
  const d = await adminDashboard(period);
  const { revenue: rv, growth: g, health: h, window: w } = d;
  const vs = `vs. ${w.label} anteriores`;

  return (
    <>
      <PageHeader title="Indicadores" subtitle={`Últimos ${w.label} (${fmtDay(w.from)} a ${fmtDay(w.to)}), comparados aos ${w.label} anteriores`}>
        <a className="btn-ghost h-9" href="/api/admin/export?kind=users"><Download className="h-4 w-4" />Usuários</a>
        <a className="btn-ghost h-9" href="/api/admin/export?kind=programs"><Download className="h-4 w-4" />Programas</a>
        <a className="btn-ghost h-9" href="/api/admin/export?kind=audit"><Download className="h-4 w-4" />Auditoria</a>
      </PageHeader>
      <Segmented items={PERIODS.map((p) => ({ key: p.key, label: p.label, href: `/admin?p=${p.key}` }))} active={period} />

      {/* ---------- Receita ---------- */}
      <Section title="Receita" subtitle="Assinaturas em vigor hoje. O MRR soma o valor cobrado no Mercado Pago e o preço de tabela dos planos ativados pela administração.">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi icon={<BadgeDollarSign className="h-4 w-4" />} label="MRR" value={fmtBRL(rv.mrrCents)} hint={<>{fmtBRL(rv.paidCents)} no Mercado Pago · {fmtBRL(rv.manualCents)} ativado pelo admin</>} />
          <Kpi icon={<TrendingUp className="h-4 w-4" />} label="ARR" value={fmtBRL(rv.arrCents)} hint="MRR × 12" />
          <Kpi icon={<Users className="h-4 w-4" />} label="Pagantes" value={fmtPts(rv.payers)} hint={`Ticket médio ${fmtBRL(rv.arpuCents)}/mês · ${rv.newPayers.cur} novos no período`} />
          <Kpi icon={<Repeat className="h-4 w-4" />} label="Churn" value={pct(rv.churn.rate)} delta={rv.churn.delta} inverse hint={`${rv.churn.lost} ${rv.churn.lost === 1 ? "saída" : "saídas"} · antes ${pct(rv.churn.prevRate)}`} />
          <Kpi label="Em teste agora" value={fmtPts(rv.trialsActive)} hint="Usando o Gestor no teste grátis" href="/admin/users?f=trial" />
          <Kpi label="Conversão do teste" value={pct(rv.trialConversion.rate)} hint={`${rv.trialConversion.converted} de ${rv.trialConversion.ended} testes encerrados no período`} />
          <Kpi label="Pedidos de plano" value={fmtPts(h.pendingRequests)} hint="Esperando ativação" href="/admin/users?f=request" />
          <Kpi label="Volume vendido" value={fmtBRL(d.salesVolume.cur)} delta={d.salesVolume.delta} hint={`Vendas dos clientes ${vs}`} />
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <Panel title="Assinantes por plano" subtitle="Pagantes ativos, por plano e cobrança">
            <Donut unit="assinantes" label="Gráfico de assinantes por plano" data={rv.byPlan.map((p) => ({ name: `${PLANS[p.plan].name} ${p.interval === "ANUAL" ? "anual" : "mensal"}`, value: p.count }))} />
            {rv.byPlan.length > 0 && (
              <table className="mt-4 w-full text-sm">
                <thead><tr className="text-left text-xs text-muted"><th className="pb-1 font-medium">Plano</th><th className="pb-1 text-right font-medium">Assinantes</th><th className="pb-1 text-right font-medium">MRR</th></tr></thead>
                <tbody>{rv.byPlan.map((p) => <tr key={`${p.plan}${p.interval}`} className="border-t border-line"><td className="py-1.5">{PLANS[p.plan].name} {p.interval === "ANUAL" ? "anual" : "mensal"}</td><td className="text-right tabular-nums">{p.count}</td><td className="text-right tabular-nums">{fmtBRL(p.mrrCents)}</td></tr>)}</tbody>
              </table>
            )}
          </Panel>
          <Panel title="Funil do teste ao plano pago" subtitle={`Quem se cadastrou nos últimos ${w.label}`}>
            <ol className="space-y-3">
              {d.funnel.map((s, i) => (
                <li key={s.key}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span>{s.label}</span>
                    <span className="tabular-nums"><strong className="font-semibold">{fmtPts(s.count)}</strong>{i > 0 && <span className="ml-2 text-xs text-muted">{pct(s.pctOfPrev)} da etapa anterior</span>}</span>
                  </div>
                  <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-panel2" aria-hidden>
                    <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(s.pctOfFirst, s.count ? 2 : 0)}%`, opacity: 1 - i * 0.18 }} />
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-xs text-muted">Conversão total: <strong className="text-zinc-200">{pct(d.funnel.at(-1)?.pctOfFirst ?? 0)}</strong> dos cadastros viraram pagantes.</p>
          </Panel>
        </div>
      </Section>

      {/* ---------- Vencimentos e risco ---------- */}
      <Section title="Atenção" subtitle="O que vence nos próximos 7 dias e quem pode cancelar">
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel title="Vencem logo" subtitle="Testes que acabam, renovações previstas, pausas e pedidos pendentes">
            {d.expiring.length === 0 ? <p className="py-6 text-center text-sm text-muted">Nada vence nos próximos 7 dias.</p> : (
              <ul className="-mx-2 max-h-96 divide-y divide-line overflow-y-auto">
                {d.expiring.slice(0, 30).map((e) => (
                  <li key={`${e.kind}${e.userId}`} className="flex items-center gap-3 px-2 py-2 text-sm">
                    <CalendarClock className="h-4 w-4 shrink-0 text-muted" />
                    <Link href={userHref(e.user.email)} className="min-w-0 flex-1 hover:underline"><span className="block truncate font-medium">{e.user.name}</span><span className="block truncate text-xs text-muted">{e.detail}</span></Link>
                    <Pill tone={KIND[e.kind].tone}>{KIND[e.kind].label}</Pill>
                    <span className="w-24 shrink-0 text-right text-xs tabular-nums text-muted">{e.kind === "request" || e.kind === "paused" ? `desde ${fmtDay(e.at)}` : fmtDay(e.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Em risco de cancelar" subtitle="Pagantes e testes sem login, lançamento ou venda há 14 dias ou mais">
            {d.risk.length === 0 ? <p className="py-6 text-center text-sm text-muted">Ninguém em risco agora.</p> : (
              <ul className="-mx-2 max-h-96 divide-y divide-line overflow-y-auto">
                {d.risk.map((x) => (
                  <li key={x.userId} className="flex items-center gap-3 px-2 py-2 text-sm">
                    <AlertTriangle className={`h-4 w-4 shrink-0 ${x.reason.startsWith("Pediu") ? "text-red-400" : "text-amber-300"}`} />
                    <Link href={userHref(x.user.email)} className="min-w-0 flex-1 hover:underline"><span className="block truncate font-medium">{x.user.name}</span><span className="block truncate text-xs text-muted">{x.reason}</span></Link>
                    <span className="shrink-0 text-right text-xs text-muted">{x.lastActivity ? `último uso ${fmtDay(x.lastActivity)}` : "nunca usou"}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </Section>

      {/* ---------- Crescimento ---------- */}
      <Section title="Crescimento e engajamento" subtitle="Atividade = login, lançamento ou venda registrada">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi icon={<UserPlus className="h-4 w-4" />} label="Cadastros" value={fmtPts(g.signups.cur)} delta={g.signups.delta} hint={`${g.signups.prev} ${vs} · ${fmtPts(g.totalUsers)} no total`} />
          <Kpi icon={<Activity className="h-4 w-4" />} label="Usuários ativos" value={fmtPts(g.active.cur)} delta={g.active.delta} hint={`${g.active.prev} ${vs}`} />
          <Kpi label="DAU / WAU / MAU" value={`${g.dau} / ${g.wau} / ${g.mau}`} hint={`Aderência (DAU/MAU): ${pct(g.stickiness)}`} />
          <Kpi label="Ativação em 7 dias" value={pct(g.activation.rate)} hint={`${g.activation.activated} de ${g.activation.eligible} fizeram o 1º lançamento · antes ${pct(g.activation.prevRate)}`} />
        </div>
        <div className="mt-3">
          <Panel title="Cadastros e usuários ativos" subtitle={w.bucket === "day" ? "Por dia" : w.bucket === "week" ? "Por semana" : "Por mês"}>
            <CountSeries data={g.series} bucket={w.bucket} label="Gráfico de cadastros e usuários ativos" empty="Sem cadastros nem atividade no período." series={[{ key: "signups", name: "Cadastros", color: "#60a5fa" }, { key: "active", name: "Usuários ativos", color: "#4ade80" }]} />
          </Panel>
        </div>
      </Section>

      {/* ---------- Uso por recurso ---------- */}
      <Section title="Uso por recurso" subtitle={`Registros criados nos últimos ${w.label} · ${d.programs} programas ativos`}>
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel title="No período">
            <HBar unit="" data={d.usage.map((u) => ({ name: u.label, value: u.cur }))} />
          </Panel>
          <div className="card overflow-x-auto">
            <table className="table-base">
              <thead><tr><th>Recurso</th><th className="text-right">Período</th><th className="text-right">Anterior</th><th className="text-right">Variação</th><th className="hidden text-right sm:table-cell">Total</th></tr></thead>
              <tbody>
                {d.usage.map((u) => (
                  <tr key={u.key}><td>{u.label}</td><td className="text-right tabular-nums">{fmtPts(u.cur)}</td><td className="text-right tabular-nums text-muted">{fmtPts(u.prev)}</td><td className="text-right"><DeltaBadge d={u.delta} /></td><td className="hidden text-right tabular-nums text-muted sm:table-cell">{fmtPts(u.total)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      {/* ---------- Saúde e suporte ---------- */}
      <Section title="Saúde do sistema e suporte" action={<Link href="/admin/audit" className="text-xs text-accent-light hover:underline">Ver auditoria completa</Link>}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi icon={<Mail className="h-4 w-4" />} label="E-mails automáticos" value={fmtPts(h.emails.cur)} delta={h.emails.delta} hint={h.emails.byKind.length ? h.emails.byKind.map((k) => `${k.kind}: ${k.count}`).join(" · ") : "Nenhum aviso enviado no período"} />
          <Kpi label="Push" value={fmtPts(h.push.total)} hint={`${h.push.new} aparelhos novos no período`} />
          <Kpi icon={<ShieldAlert className="h-4 w-4" />} label="Falhas de login" value={fmtPts(h.loginFailures.cur)} delta={h.loginFailures.delta} inverse hint={`${h.loginFailures.prev} ${vs}`} />
          <Kpi label="Contas" value={fmtPts(g.activeAccounts)} hint={`${h.disabled} desativadas · ${h.deletionRequests} pediram exclusão`} href="/admin/users?f=deletion" />
        </div>
        <div className="mt-3">
          <Panel title="Últimas ações registradas">
            <ul className="-mx-2 divide-y divide-line">
              {h.recentAudit.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-2 py-1.5 text-sm">
                  <code className="min-w-0 flex-1 truncate text-xs">{a.action}</code>
                  <span className="hidden max-w-[40%] truncate text-xs text-muted sm:inline">{a.actor}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted">{fmtDateTime(a.at)}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </Section>
    </>
  );
}
