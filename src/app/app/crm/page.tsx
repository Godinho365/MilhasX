import Link from "next/link";
import { requirePageUser } from "@/server/session";
import { prisma } from "@/server/db";
import { listOrders, ordersDashboard } from "@/server/services/orders";
import { PageHeader, Stat } from "@/components/stat";
import { Segmented } from "@/components/ui";
import { fmtBRL } from "@/lib/format";
import { STAGE_LABELS } from "@/domain/orders";
import { Kanban, OrdersList, LeadsList } from "./client";
import { listLeads } from "@/server/services/leads";

const PERIODS = [["7", "Últimos 7 dias"], ["30", "Últimos 30 dias"], ["90", "Últimos 90 dias"], ["365", "Últimos 12 meses"], ["all", "Tudo"]] as const;

export default async function CrmPage({ searchParams }: { searchParams: Promise<{ view?: string; periodo?: string }> }) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const view = sp.view === "lista" ? "lista" : sp.view === "dashboard" ? "dashboard" : "kanban";
  const customers = (await prisma.customer.findMany({ where: { userId: user.id }, select: { id: true, name: true, phone: true, email: true }, orderBy: { name: "asc" } }));
  const subtitle = { kanban: "Arraste os cartões entre as colunas para atualizar o andamento de cada pedido.", lista: "Todos os pedidos em formato de lista, ativos e arquivados.", dashboard: "Os principais indicadores da sua operação de pedidos." }[view];
  return (
    <>
      <PageHeader title="CRM" subtitle={subtitle} />
      <Segmented active={view} items={[
        { key: "dashboard", label: "Dashboard", href: "/app/crm?view=dashboard" },
        { key: "kanban", label: "Kanban", href: "/app/crm" },
        { key: "lista", label: "Lista", href: "/app/crm?view=lista" },
      ]} />
      {view === "kanban" && <Kanban orders={await listOrders(user.id)} customers={customers} />}
      {view === "lista" && (
        <>
          <OrdersList active={await listOrders(user.id)} archived={await listOrders(user.id, { archived: true })} customers={customers} />
          <LeadsList leads={await listLeads(user.id)} />
        </>
      )}
      {view === "dashboard" && <Dashboard userId={user.id} periodo={sp.periodo ?? "30"} />}
    </>
  );
}

function Ranked({ title, subtitle, items, unit, empty }: { title: string; subtitle: string; items: { name: string; value: number }[]; unit: [string, string]; empty: string }) {
  const total = items.reduce((t, i) => t + i.value, 0);
  return (
    <section className="card card-pad" aria-label={title}>
      <h2 className="font-semibold">{title}</h2>
      <p className="mb-3 text-sm text-muted">{subtitle}</p>
      {items.length === 0 ? <p className="py-4 text-sm text-muted">{empty}</p> : (
        <ol className="space-y-2">
          {items.map((it, i) => (
            <li key={it.name} className="flex items-center gap-3 text-sm">
              <span className="w-6 text-muted">{i + 1}º</span>
              <span className="min-w-0 flex-1 truncate font-medium">{it.name}</span>
              <span className="tabular-nums text-muted">{it.value} {it.value === 1 ? unit[0] : unit[1]} ({total ? Math.round((it.value / total) * 100) : 0}%)</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

async function Dashboard({ userId, periodo }: { userId: string; periodo: string }) {
  const days = periodo === "all" ? null : Number(periodo) || 30;
  const d = await ordersDashboard(userId, days);
  return (
    <div className="space-y-4">
      <nav aria-label="Período" className="flex flex-wrap gap-1">
        {PERIODS.map(([k, l]) => (
          <Link key={k} href={`/app/crm?view=dashboard&periodo=${k}`} aria-current={periodo === k ? "page" : undefined} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${periodo === k ? "bg-accent text-white" : "text-muted hover:text-zinc-100"}`}>{l}</Link>
        ))}
      </nav>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Pedidos no período" value={String(d.totals.orders)} hint={`${d.totals.withBudget} com orçamento`} />
        <Stat label="Valor total orçado" value={fmtBRL(d.totals.budgetCents)} hint={`Orçamento médio ${fmtBRL(d.totals.avgBudgetCents)}`} />
        <Stat label="Clientes atendidos" value={String(d.totals.customers)} hint={`${d.totals.highPriority} com prioridade alta`} />
        <Stat label="Arquivados no período" value={String(d.totals.archived)} />
      </div>
      <section className="card card-pad" aria-label="Captação de pedidos">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">Captação de pedidos {d.capture?.active ? <span className="ml-1 rounded bg-green-500/15 px-1.5 text-xs text-green-300">Página ativa</span> : <span className="ml-1 rounded bg-panel2 px-1.5 text-xs text-muted">Desligada</span>}</h2>
            <p className="text-sm text-muted">Clientes pedem cotação pela sua página pública e o pedido cai em “Novos pedidos”.</p>
          </div>
          {d.capture ? <Link href={`/p/${d.capture.slug}`} target="_blank" className="btn-ghost h-9">Ver página</Link> : <Link href="/app/settings?tab=sales-profile" className="btn-primary h-9">Criar página pública</Link>}
        </div>
        {d.capture && (
          <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
            <div><p className="kicker">Visitas</p><p className="text-xl font-semibold tabular-nums">{d.capture.views}</p></div>
            <div><p className="kicker">Pedidos enviados</p><p className="text-xl font-semibold tabular-nums">{d.capture.orders}</p></div>
            <div><p className="kicker">Conversão</p><p className="text-xl font-semibold tabular-nums">{d.capture.conversion == null ? "—" : `${d.capture.conversion.toLocaleString("pt-BR")}%`}</p></div>
          </div>
        )}
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <Ranked title="Destinos mais buscados" subtitle="Cidades de chegada mais pedidas pelos clientes." items={d.destinations} unit={["busca", "buscas"]} empty="Sem pedidos no período." />
        <Ranked title="Origens mais buscadas" subtitle="De onde os viajantes costumam partir." items={d.origins} unit={["busca", "buscas"]} empty="Sem pedidos no período." />
        <Ranked title="Meses mais procurados" subtitle="Épocas de viagem mais pedidas." items={d.months} unit={["viagem", "viagens"]} empty="Sem datas informadas." />
        <Ranked title="Classes solicitadas" subtitle="Preferência de cabine dos passageiros." items={d.cabins} unit={["pedido", "pedidos"]} empty="Sem pedidos no período." />
      </div>
      <section className="card card-pad" aria-label="Comportamento e demanda">
        <h2 className="mb-3 font-semibold">Comportamento &amp; Demanda</h2>
        <div className="grid grid-cols-2 gap-4 text-sm lg:grid-cols-4">
          <div><p className="kicker">Média de passageiros</p><p className="text-lg font-semibold">{d.behavior.avgPax.toLocaleString("pt-BR")} por pedido</p><p className="text-xs text-muted">{d.behavior.adt} adt · {d.behavior.chd} chd · {d.behavior.inf} inf</p></div>
          <div><p className="kicker">Formato de viagem</p><p className="text-lg font-semibold">{d.behavior.rt} ida e volta</p><p className="text-xs text-muted">{d.behavior.oneWay} só ida · {d.behavior.multi} múltiplos</p></div>
          <div><p className="kicker">Datas flexíveis</p><p className="text-lg font-semibold">{d.behavior.flexiblePct}% dos clientes</p><p className="text-xs text-muted">Facilita emissões com milhas</p></div>
          <div><p className="kicker">Bagagem despachada</p><p className="text-lg font-semibold">{d.behavior.bagPct}% pediram</p><p className="text-xs text-muted">Oportunidade de taxa ou serviço</p></div>
        </div>
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card card-pad" aria-label="Pipeline atual">
          <h2 className="font-semibold">Pipeline atual</h2>
          <p className="mb-3 text-sm text-muted">Pedidos ativos por coluna (não considera o período).</p>
          <ul className="space-y-1.5 text-sm">{d.pipeline.map((p) => <li key={p.stage} className="flex justify-between"><span>{STAGE_LABELS[p.stage]}</span><span className="tabular-nums text-muted">{p.count} {p.count === 1 ? "pedido" : "pedidos"}</span></li>)}</ul>
        </section>
        <section className="card card-pad" aria-label="Alertas da operação">
          <h2 className="font-semibold">Alertas da operação</h2>
          <p className="mb-3 text-sm text-muted">Pedidos novos ou em cotação parados há mais de 2 dias.</p>
          {d.alerts.length === 0 ? <p className="text-sm text-muted">Nenhum alerta pendente no momento.</p> : (
            <ul className="space-y-1.5 text-sm">{d.alerts.map((a) => <li key={a.id}>#{a.number} {a.customerName} · {STAGE_LABELS[a.stage]} há {a.days} dias</li>)}</ul>
          )}
          <h3 className="kicker mb-2 mt-5">Motivos de arquivamento</h3>
          {d.archiveReasons.length === 0 ? <p className="text-sm text-muted">Nenhum pedido arquivado no período.</p> : <ul className="space-y-1 text-sm">{d.archiveReasons.map((r) => <li key={r.name} className="flex justify-between"><span>{r.name}</span><span className="text-muted">{r.value}</span></li>)}</ul>}
        </section>
      </div>
    </div>
  );
}
