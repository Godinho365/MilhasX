"use client";
// Visão geral: os blocos do painel na ordem de cada pessoa. "Personalizar" deixa arrastar (ou mover com as setas),
// esconder e voltar blocos; a escolha fica nas preferências de quem entrou.
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarDays, ListChecks, BarChart3, Landmark, Coins, Target, WalletCards, Users, LayoutGrid, Settings2, ArrowUp, ArrowDown, EyeOff, Plus, GripVertical,
  TrendingUp, TrendingDown, AlertTriangle, ArrowRight,
} from "lucide-react";
import { api } from "@/lib/api";
import { refreshSafe } from "@/lib/nav";
import { fmtBRL, fmtPts } from "@/lib/format";
import { toast } from "@/components/feedback";
import { EVENT_KINDS, type CalEvent } from "@/domain/calendar";
import { OVERVIEW_WIDGETS, type WidgetKey } from "@/domain/overview";
import type { OverviewData } from "@/server/services/overview";

type Shortcut = { href: string; label: string };
export type OverviewProps = { widgets: WidgetKey[]; hidden: WidgetKey[]; data: OverviewData; shortcuts: Shortcut[]; me: string | null; members: { id: string; name: string }[] };

const ICONS: Record<WidgetKey, React.ComponentType<{ className?: string }>> = {
  agenda: CalendarDays, tarefas: ListChecks, kpis: BarChart3, financeiro: Landmark, emissoes: Coins, metas: Target, milhas: WalletCards, clientes: Users, atalhos: LayoutGrid,
};
const LINKS: Partial<Record<WidgetKey, [string, string]>> = {
  agenda: ["/app/calendario", "Abrir o calendário"], tarefas: ["/app/equipe/tarefas", "Ver quadros"], kpis: ["/app/metricas", "Ver métricas"],
  financeiro: ["/app/financeiro", "Abrir o Financeiro"], emissoes: ["/app/crm-milhas", "Abrir o CRM Milhas"], metas: ["/app/equipe/metas", "Ver metas e comissões"],
  milhas: ["/app/programs", "Central de Contas"], clientes: ["/app/sales?tab=clientes", "Ver clientes"],
};
const WIDE: WidgetKey[] = ["agenda", "tarefas"];
const fmt = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC", ...o });

export function OverviewClient(p: OverviewProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [order, setOrder] = useState<WidgetKey[]>(p.widgets);
  const [hidden, setHidden] = useState<WidgetKey[]>(p.hidden);
  const [drag, setDrag] = useState<WidgetKey | null>(null);
  const [busy, setBusy] = useState(false);
  const move = (k: WidgetKey, dir: -1 | 1) => {
    const i = order.indexOf(k), j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order]; [next[i], next[j]] = [next[j]!, next[i]!]; setOrder(next);
  };
  const dropOn = (target: WidgetKey) => {
    if (!drag || drag === target) return;
    const next = order.filter((k) => k !== drag);
    next.splice(next.indexOf(target), 0, drag);
    setOrder(next);
  };
  const hide = (k: WidgetKey) => { setOrder(order.filter((x) => x !== k)); setHidden([...hidden, k]); };
  const add = (k: WidgetKey) => { setHidden(hidden.filter((x) => x !== k)); setOrder([...order, k]); };
  async function save() {
    setBusy(true);
    const r = await api("/api/preferences/overview", "PATCH", { widgets: order });
    setBusy(false);
    if (!r.ok) return toast(r.erro, "error");
    setEditing(false);
    toast("Visão geral salva");
    refreshSafe(router); // carrega os blocos que voltaram
  }
  function cancel() { setOrder(p.widgets); setHidden(p.hidden); setEditing(false); }
  async function reset() {
    const r = await api("/api/preferences/overview", "PATCH", { widgets: [] });
    if (!r.ok) return toast(r.erro, "error");
    setEditing(false);
    toast("Blocos no padrão");
    refreshSafe(router);
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
        {editing ? (
          <>
            <span className="mr-auto text-sm text-muted">Arraste os blocos (ou use as setas) e esconda o que não usa.</span>
            <button className="btn-ghost h-9" onClick={reset}>Voltar ao padrão</button>
            <button className="btn-ghost h-9" onClick={cancel}>Cancelar</button>
            <button className="btn-primary h-9" onClick={save} disabled={busy}>Concluir</button>
          </>
        ) : (
          <button className="btn-ghost h-9" onClick={() => setEditing(true)}><Settings2 className="h-4 w-4" />Personalizar</button>
        )}
      </div>
      {editing && hidden.length > 0 && (
        <div className="card card-pad mb-4">
          <p className="kicker mb-2">Blocos escondidos</p>
          <div className="flex flex-wrap gap-2">{hidden.map((k) => <button key={k} className="btn-ghost h-8 text-xs" onClick={() => add(k)}><Plus className="h-3.5 w-3.5" />{OVERVIEW_WIDGETS[k].label}</button>)}</div>
        </div>
      )}
      {order.length === 0 ? (
        <div className="card card-pad py-10 text-center text-sm text-muted">Todos os blocos estão escondidos. Use Personalizar para voltar algum.</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {order.map((k, i) => {
            const Icon = ICONS[k];
            const link = LINKS[k];
            return (
              <section key={k} aria-label={OVERVIEW_WIDGETS[k].label} draggable={editing}
                onDragStart={() => setDrag(k)} onDragEnd={() => setDrag(null)} onDragOver={(e) => { if (editing) e.preventDefault(); }} onDrop={() => dropOn(k)}
                className={`card card-pad flex min-w-0 flex-col ${WIDE.includes(k) ? "lg:row-span-2" : ""} ${editing ? "cursor-move ring-1 ring-dashed ring-line" : ""} ${drag === k ? "opacity-50" : ""}`}>
                <header className="mb-3 flex items-center gap-2">
                  {editing && <GripVertical className="h-4 w-4 text-muted" aria-hidden />}
                  <Icon className="h-4 w-4 text-muted" />
                  <h2 className="font-semibold">{OVERVIEW_WIDGETS[k].label}</h2>
                  <span className="flex-1" />
                  {editing ? (
                    <span className="flex gap-1">
                      <button className="btn-subtle h-7 w-7 px-0" onClick={() => move(k, -1)} disabled={i === 0} aria-label={`Subir ${OVERVIEW_WIDGETS[k].label}`}><ArrowUp className="h-3.5 w-3.5" /></button>
                      <button className="btn-subtle h-7 w-7 px-0" onClick={() => move(k, 1)} disabled={i === order.length - 1} aria-label={`Descer ${OVERVIEW_WIDGETS[k].label}`}><ArrowDown className="h-3.5 w-3.5" /></button>
                      <button className="btn-subtle h-7 w-7 px-0" onClick={() => hide(k)} aria-label={`Esconder ${OVERVIEW_WIDGETS[k].label}`}><EyeOff className="h-3.5 w-3.5" /></button>
                    </span>
                  ) : link ? <Link href={link[0]} className="text-xs text-accent-light hover:underline">{link[1]}</Link> : null}
                </header>
                <div className="min-w-0 flex-1"><Widget k={k} p={p} /></div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

function Widget({ k, p }: { k: WidgetKey; p: OverviewProps }) {
  const d = p.data;
  if (k === "atalhos") return <Shortcuts list={p.shortcuts} />;
  if (k === "agenda") return d.agenda ? <Agenda {...d.agenda} /> : <Missing />;
  if (k === "tarefas") return d.tarefas ? <Tasks {...d.tarefas} me={p.me} /> : <Missing />;
  if (k === "kpis") return d.kpis ? <Kpis {...d.kpis} /> : <Missing />;
  if (k === "financeiro") return d.financeiro ? <Finance {...d.financeiro} /> : <Missing />;
  if (k === "emissoes") return d.emissoes ? <Deals {...d.emissoes} /> : <Missing />;
  if (k === "metas") return d.metas ? <Goals {...d.metas} /> : <Missing />;
  if (k === "milhas") return d.milhas ? <Miles {...d.milhas} /> : <Missing />;
  if (k === "clientes") return d.clientes ? <Customers {...d.clientes} /> : <Missing />;
  return null;
}
const Missing = () => <p className="text-sm text-muted">Não foi possível carregar agora. Atualize a página.</p>;

function Num({ label, value, hint, tone }: { label: string; value: string; hint?: React.ReactNode; tone?: "up" | "down" | "warn" }) {
  return (
    <div className="min-w-0 rounded-xl bg-panel2/60 p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-0.5 truncate text-lg font-semibold tabular-nums ${tone === "down" ? "text-red-300" : tone === "warn" ? "text-amber-300" : ""}`}>{value}</p>
      {hint && <p className="mt-0.5 truncate text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

function Agenda({ today, events }: { today: string; events: CalEvent[] }) {
  const days = Array.from(new Set(events.flatMap((e) => (e.date < today ? [today] : [e.date])))).sort().slice(0, 7);
  if (!events.length) return <p className="text-sm text-muted">Nada nos próximos 7 dias.</p>;
  return (
    <div className="space-y-3">
      {days.map((day) => {
        const list = events.filter((e) => (e.date < today ? today : e.date) === day);
        return (
          <div key={day}>
            <p className={`mb-1 text-xs font-semibold first-letter:uppercase ${day === today ? "text-accent-light" : "text-muted"}`}>{day === today ? "Hoje" : fmt(day, { weekday: "long", day: "numeric", month: "short" })}</p>
            <ul className="space-y-1">
              {list.slice(0, 6).map((e) => (
                <li key={e.id}>
                  <Link href={e.href ?? `/app/calendario?visao=dia&data=${e.date}`} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-panel2">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: EVENT_KINDS[e.kind].color }} aria-hidden />
                    <span className="w-11 shrink-0 text-xs tabular-nums text-muted">{e.time ?? "dia"}</span>
                    <span className={`min-w-0 flex-1 truncate ${e.done ? "text-muted line-through" : ""}`}>{e.title}</span>
                    <span className="hidden shrink-0 text-[11px] text-muted sm:inline">{EVENT_KINDS[e.kind].label}</span>
                  </Link>
                </li>
              ))}
              {list.length > 6 && <li><Link href={`/app/calendario?visao=dia&data=${day}`} className="px-2 text-xs text-accent-light hover:underline">+{list.length - 6} neste dia</Link></li>}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

type TaskRow = NonNullable<OverviewData["tarefas"]>["tasks"][number];
function Tasks({ today, tasks, me }: { today: string; tasks: TaskRow[]; me: string | null }) {
  const [scope, setScope] = useState<"mine" | "all">("all");
  // do dono: as sem responsável (a tarefa sem membro é do dono da conta)
  const mine = (t: TaskRow) => (me ? t.memberIds.includes(me) : t.memberIds.length === 0);
  const list = scope === "mine" ? tasks.filter(mine) : tasks;
  const late = list.filter((t) => t.dueDate && t.dueDate < today).length;
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <div className="inline-flex gap-1 rounded-lg border border-line p-0.5 text-xs" role="tablist" aria-label="De quem">
          {([["all", "Todas"], ["mine", "Minhas"]] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={scope === k} onClick={() => setScope(k)} className={`rounded-md px-2.5 py-1 ${scope === k ? "bg-panel2 text-white" : "text-muted"}`}>{l}</button>)}
        </div>
        <span className="text-xs text-muted">{list.length} pendentes{late ? <span className="text-red-300"> · {late} atrasadas</span> : null}</span>
      </div>
      {list.length === 0 ? <p className="py-4 text-sm text-muted">Tudo em dia.</p> : (
        <ul className="space-y-1">
          {list.slice(0, 8).map((t) => {
            const overdue = !!t.dueDate && t.dueDate < today;
            return (
              <li key={t.id}>
                <Link href={t.boardId ? `/app/equipe/tarefas?quadro=${t.boardId}` : "/app/equipe/tarefas"} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-panel2">
                  {overdue ? <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-300" aria-label="Atrasada" /> : <span className={`h-2 w-2 shrink-0 rounded-full ${t.priority === "URGENT" ? "bg-red-400" : t.priority === "HIGH" ? "bg-amber-400" : "bg-slate-500"}`} aria-hidden />}
                  <span className="min-w-0 flex-1 truncate">{t.title}</span>
                  {t.doing && <span className="rounded bg-panel2 px-1.5 text-[10px] text-muted">em andamento</span>}
                  <span className={`shrink-0 text-xs tabular-nums ${overdue ? "text-red-300" : "text-muted"}`}>{t.dueDate ? (t.dueDate === today ? `hoje${t.dueTime ? ` ${t.dueTime}` : ""}` : fmt(t.dueDate, { day: "2-digit", month: "2-digit" })) : "sem prazo"}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {list.length > 8 && <Link href="/app/equipe/tarefas" className="mt-1 inline-flex items-center gap-1 px-2 text-xs text-accent-light hover:underline">Mais {list.length - 8}<ArrowRight className="h-3 w-3" /></Link>}
    </div>
  );
}

type K = NonNullable<OverviewData["kpis"]>["now"];
function delta(now: number | null, prev: number | null) {
  if (now == null || !prev) return null;
  const pct = Math.round(((now - prev) / Math.abs(prev)) * 100);
  return <span className={`inline-flex items-center gap-0.5 ${pct >= 0 ? "text-emerald-300" : "text-red-300"}`}>{pct >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}{pct > 0 ? "+" : ""}{pct}% vs. mês anterior</span>;
}
function Kpis({ now, prev }: { from: string; to: string; now: K; prev: K }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Num label="Faturamento" value={fmtBRL(now.revenueCents)} hint={delta(now.revenueCents, prev.revenueCents)} />
      <Num label="Lucro" value={fmtBRL(now.profitCents)} hint={delta(now.profitCents, prev.profitCents)} tone={now.profitCents < 0 ? "down" : undefined} />
      <Num label="Vendas" value={fmtPts(now.count)} hint={delta(now.count, prev.count)} />
      <Num label="Ticket médio" value={fmtBRL(now.ticketCents)} hint={now.marginPct != null ? `Margem ${String(now.marginPct).replace(".", ",")}%` : undefined} />
    </div>
  );
}

function Finance({ cashCents, receivableCents, payableCents, toPay }: NonNullable<OverviewData["financeiro"]>) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Num label="Em contas" value={fmtBRL(cashCents)} tone={cashCents < 0 ? "down" : undefined} />
        <Num label="A receber" value={fmtBRL(receivableCents)} />
        <Num label="A pagar" value={fmtBRL(payableCents)} tone={payableCents > 0 ? "warn" : undefined} />
      </div>
      {toPay.length > 0 && (
        <ul className="space-y-1 text-sm">
          {toPay.map((t) => (
            <li key={t.id} className="flex items-center gap-2 px-1">
              <span className={`w-12 shrink-0 text-xs tabular-nums ${t.overdue ? "text-red-300" : "text-muted"}`}>{fmt(t.dueDate, { day: "2-digit", month: "2-digit" })}</span>
              <span className="min-w-0 flex-1 truncate">{t.description}</span>
              <span className="shrink-0 tabular-nums">{fmtBRL(t.amountCents)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Deals({ stages }: NonNullable<OverviewData["emissoes"]>) {
  const max = Math.max(1, ...stages.map((s) => s.count));
  return (
    <ul className="space-y-2">
      {stages.map((s) => (
        <li key={s.key} className="text-sm">
          <div className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate">{s.label}</span><span className="tabular-nums text-muted">{s.count}</span><span className="w-24 text-right text-xs tabular-nums text-muted">{s.valueCents ? fmtBRL(s.valueCents) : ""}</span></div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-panel2"><div className="h-full rounded-full bg-accent-light" style={{ width: `${(s.count / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

function Goals({ goalCents, achievedCents, dueCents, paidMonthCents }: NonNullable<OverviewData["metas"]>) {
  const pct = goalCents ? Math.round((achievedCents / goalCents) * 100) : null;
  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-baseline justify-between text-sm"><span className="text-muted">Meta de faturamento do mês</span><span className="font-semibold tabular-nums">{goalCents ? fmtBRL(goalCents) : "sem meta"}</span></div>
        {pct != null && <><div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-panel2"><div className={`h-full rounded-full ${pct >= 100 ? "bg-emerald-400" : pct >= 60 ? "bg-accent-light" : "bg-amber-400"}`} style={{ width: `${Math.min(100, pct)}%` }} /></div><p className="mt-1 text-xs text-muted">{fmtBRL(achievedCents)} realizados · {pct}%</p></>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Num label="Comissões a pagar" value={fmtBRL(dueCents)} tone={dueCents > 0 ? "warn" : undefined} />
        <Num label="Pagas no mês" value={fmtBRL(paidMonthCents)} />
      </div>
    </div>
  );
}

function Miles({ balance, marketValueCents, pendingPoints, accounts }: NonNullable<OverviewData["milhas"]>) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Num label="Saldo" value={`${fmtPts(balance)} pts`} hint={`${accounts} ${accounts === 1 ? "conta" : "contas"}`} />
      <Num label="Valor de mercado" value={fmtBRL(marketValueCents)} />
      <Num label="A creditar" value={`${fmtPts(pendingPoints)} pts`} hint="Agendados" />
    </div>
  );
}

function Customers({ total, newMonth, interests }: NonNullable<OverviewData["clientes"]>) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <Num label="Clientes" value={fmtPts(total)} />
      <Num label="Novos no mês" value={fmtPts(newMonth)} />
      <Num label="Interesses abertos" value={fmtPts(interests)} hint={<Link href="/app/contatos/interesses" className="text-accent-light hover:underline">Ver</Link>} />
    </div>
  );
}

function Shortcuts({ list }: { list: Shortcut[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {list.map((s) => <Link key={s.href} href={s.href} className="rounded-xl bg-panel2/60 px-3 py-2.5 text-sm font-medium hover:bg-panel2">{s.label}</Link>)}
    </div>
  );
}
