import Link from "next/link";
import { requirePageUser } from "@/server/session";
import { prisma } from "@/server/db";
import { listDeals, milesDealsDashboard } from "@/server/services/miles-deals";
import { PageHeader, Stat } from "@/components/stat";
import { Segmented } from "@/components/ui";
import { fmtBRL, fmtPts } from "@/lib/format";
import { BUYER_LABELS, DEAL_STAGE_LABELS } from "@/domain/miles-deals";
import { DealsKanban, DealsList } from "./client";

const PERIODS = [["7", "Últimos 7 dias"], ["30", "Últimos 30 dias"], ["90", "Últimos 90 dias"], ["365", "Últimos 12 meses"], ["all", "Tudo"]] as const;

export default async function CrmMilhasPage({ searchParams }: { searchParams: Promise<{ view?: string; periodo?: string }> }) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const view = sp.view === "lista" ? "lista" : sp.view === "dashboard" ? "dashboard" : "kanban";
  const [customers, accounts] = await Promise.all([
    prisma.customer.findMany({ where: { userId: user.id }, select: { id: true, name: true, phone: true }, orderBy: { name: "asc" } }),
    prisma.account.findMany({ where: { userId: user.id, archived: false }, select: { id: true, nickname: true, balance: true, costCents: true, program: { select: { name: true } }, holder: { select: { name: true } } }, orderBy: [{ program: { name: "asc" } }, { holder: { name: "asc" } }] }),
  ]);
  const accountOpts = accounts.map((a) => ({ id: a.id, label: a.nickname || `${a.program.name} · ${a.holder.name}`, balance: a.balance, cpmCents: a.balance > 0 ? Math.round((a.costCents * 1000) / a.balance) : null }));
  const subtitle = {
    kanban: "Negociações de venda de milhas. Com o bilhete a negociação fica Emitida; com o comprovante vai para Pago e a venda é lançada.",
    lista: "Todas as negociações em formato de lista, ativas e arquivadas.",
    dashboard: "Os principais indicadores das suas vendas de milhas.",
  }[view];
  return (
    <>
      <PageHeader title="CRM Milhas" subtitle={subtitle} />
      <Segmented active={view} items={[
        { key: "dashboard", label: "Dashboard", href: "/app/crm-milhas?view=dashboard" },
        { key: "kanban", label: "Kanban", href: "/app/crm-milhas" },
        { key: "lista", label: "Lista", href: "/app/crm-milhas?view=lista" },
      ]} />
      {view === "kanban" && <DealsKanban deals={await listDeals(user.id)} customers={customers} accounts={accountOpts} />}
      {view === "lista" && <DealsList active={await listDeals(user.id)} archived={await listDeals(user.id, { archived: true })} customers={customers} accounts={accountOpts} />}
      {view === "dashboard" && <Dashboard userId={user.id} periodo={sp.periodo ?? "30"} />}
    </>
  );
}

const pct = (v: number | null) => (v == null ? "—" : `${v.toLocaleString("pt-BR")}%`);

async function Dashboard({ userId, periodo }: { userId: string; periodo: string }) {
  const days = periodo === "all" ? null : Number(periodo) || 30;
  const d = await milesDealsDashboard(userId, days);
  return (
    <div className="space-y-4">
      <nav aria-label="Período" className="flex flex-wrap gap-1">
        {PERIODS.map(([k, l]) => (
          <Link key={k} href={`/app/crm-milhas?view=dashboard&periodo=${k}`} aria-current={periodo === k ? "page" : undefined} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${periodo === k ? "bg-accent text-white" : "text-muted hover:text-zinc-100"}`}>{l}</Link>
        ))}
      </nav>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Negociações no período" value={String(d.totals.created)} hint={`${d.totals.paid} ${d.totals.paid === 1 ? "paga" : "pagas"} · conversão ${pct(d.totals.conversionPct)}`} />
        <Stat label="Milhas vendidas" value={fmtPts(d.totals.points)} hint={d.totals.saleCpmCents ? `milheiro médio ${fmtBRL(d.totals.saleCpmCents)}` : "nenhuma venda paga"} />
        <Stat label="Faturamento" value={fmtBRL(d.totals.revenueCents)} hint={d.totals.avgTicketCents ? `ticket médio ${fmtBRL(d.totals.avgTicketCents)}` : "com taxas"} />
        <Stat label="Lucro" value={fmtBRL(d.totals.profitCents)} hint={d.totals.profitPerCpfCents != null ? `${fmtBRL(d.totals.profitPerCpfCents)} por CPF` : "vendas pagas"} accent />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card card-pad" aria-label="Pipeline atual">
          <h2 className="font-semibold">Pipeline atual</h2>
          <p className="mb-3 text-sm text-muted">Negociações ativas por etapa (não considera o período).</p>
          <ul className="space-y-1.5 text-sm">
            {d.pipeline.map((p) => (
              <li key={p.stage} className="flex items-center gap-3">
                <span className="flex-1">{DEAL_STAGE_LABELS[p.stage]}</span>
                <span className="tabular-nums text-muted">{p.count} · {fmtPts(p.points)} milhas</span>
                <span className="w-28 text-right tabular-nums">{fmtBRL(p.chargeCents)}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="card card-pad" aria-label="Alertas">
          <h2 className="font-semibold">Alertas</h2>
          <p className="mb-3 text-sm text-muted">Emitidas esperando o pagamento e negociações paradas há mais de 2 dias.</p>
          {d.awaitingPayment.length === 0 && d.stalled.length === 0 ? <p className="text-sm text-muted">Nenhum alerta no momento.</p> : (
            <ul className="space-y-1.5 text-sm">
              {d.awaitingPayment.map((a) => <li key={a.id}>💰 #{a.number} {a.customerName} · emitida há {a.days} {a.days === 1 ? "dia" : "dias"}, aguardando {a.chargeCents != null ? fmtBRL(a.chargeCents) : "pagamento"}</li>)}
              {d.stalled.map((a) => <li key={a.id}>⏳ #{a.number} {a.customerName} · {DEAL_STAGE_LABELS[a.stage]} há {a.days} dias</li>)}
            </ul>
          )}
        </section>
        <section className="card card-pad" aria-label="Quem mais compra">
          <h2 className="font-semibold">Quem mais compra</h2>
          <p className="mb-3 text-sm text-muted">Compradores com mais faturamento em vendas pagas no período.</p>
          {d.topBuyers.length === 0 ? <p className="py-2 text-sm text-muted">Nenhuma venda paga no período.</p> : (
            <ol className="space-y-2 text-sm">
              {d.topBuyers.map((b, i) => (
                <li key={b.name} className="flex items-center gap-3">
                  <span className="w-6 text-muted">{i + 1}º</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{b.name}</span>
                  <span className="tabular-nums text-muted">{b.deals} {b.deals === 1 ? "venda" : "vendas"} · {fmtPts(b.points)} milhas</span>
                  <span className="w-28 text-right tabular-nums">{fmtBRL(b.revenueCents)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
        <section className="card card-pad" aria-label="Por tipo de comprador">
          <h2 className="font-semibold">Por tipo de comprador</h2>
          <p className="mb-3 text-sm text-muted">Vendas pagas no período. Arquivadas no período: {d.totals.archived}.</p>
          <ul className="space-y-1.5 text-sm">
            {d.byType.map((t) => (
              <li key={t.type} className="flex items-center gap-3">
                <span className="flex-1">{BUYER_LABELS[t.type]}</span>
                <span className="tabular-nums text-muted">{t.deals} {t.deals === 1 ? "venda" : "vendas"}</span>
                <span className="w-28 text-right tabular-nums">{fmtBRL(t.revenueCents)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
