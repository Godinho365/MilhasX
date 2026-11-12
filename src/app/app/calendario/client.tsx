"use client";
// Calendário: mês, semana, dia e lista; tipos de evento (mostrar/ocultar, com contagem), filtro por responsável e
// busca; criar e editar eventos (tarefa vira uma tarefa de verdade), importar .ics e o link para o Google Agenda.
// Os eventos automáticos (vendas, tarefas, aniversários, vencimentos) abrem onde estão.
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus, Upload, CalendarDays, Search, ExternalLink, Pencil, Trash2, Copy, Link2, Repeat, MapPin, UserRound, Filter } from "lucide-react";
import { api } from "@/lib/api";
import { Modal, Field, Alert } from "@/components/ui";
import { toast, confirmDialog } from "@/components/feedback";
import {
  EVENT_KINDS, EVENT_KIND_KEYS, MANUAL_KINDS, RECURRENCES, addDays, addMonths, stepAnchor, viewRange, weekday,
  type CalEvent, type CalView, type EventKind, type Recurrence,
} from "@/domain/calendar";

type Member = { id: string; name: string; color: string | null };
type Customer = { id: string; name: string };
type Feed = { active: boolean; createdAt: string | null };
export type CalendarProps = {
  initial: { view: CalView; anchor: string; events: CalEvent[] };
  today: string; members: Member[]; customers: Customer[]; me: string | null;
  canEdit: boolean; canTask: boolean; feed: Feed | null;
};

const VIEWS: [CalView, string][] = [["dia", "Dia"], ["semana", "Semana"], ["mes", "Mês"], ["lista", "Lista"]];
const WEEKDAYS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
const fmt = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC", ...o });
const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const HIDDEN_KEY = "calendario.ocultos";

function title(view: CalView, anchor: string) {
  if (view === "mes") return fmt(anchor, { month: "long", year: "numeric" });
  if (view === "dia") return fmt(anchor, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const { from, to } = viewRange(view, anchor);
  return `${fmt(from, { day: "numeric", month: "short" })} – ${fmt(to, { day: "numeric", month: "short", year: "numeric" })}`;
}
const when = (e: CalEvent) => {
  const days = e.endDate ? `${dm(e.date)} a ${dm(e.endDate)}` : fmt(e.date, { weekday: "short", day: "numeric", month: "short" });
  return e.time ? `${days} · ${e.time}${e.endTime ? `–${e.endTime}` : ""}` : `${days} · dia todo`;
};
/** Os eventos de um dia (o de vários dias aparece em cada um). */
const onDay = (list: CalEvent[], d: string) => list.filter((e) => e.date <= d && (e.endDate ?? e.date) >= d);

function readHidden(): Set<EventKind> {
  try { return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? "[]") as EventKind[]); } catch { return new Set(); }
}

export function CalendarClient(p: CalendarProps) {
  const [view, setView] = useState<CalView>(p.initial.view);
  const [anchor, setAnchor] = useState(p.initial.anchor);
  const [events, setEvents] = useState<CalEvent[]>(p.initial.events);
  const [loading, setLoading] = useState(false);
  const [hidden, setHidden] = useState<Set<EventKind>>(new Set());
  const [member, setMember] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<CalEvent | null>(null);
  const [form, setForm] = useState<{ ev: CalEvent | null; date: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const [google, setGoogle] = useState(false);
  const [filters, setFilters] = useState(false);
  const first = useRef(true);
  const range = viewRange(view, anchor);

  useEffect(() => { setHidden(readHidden()); }, []);
  async function load() {
    setLoading(true);
    const memberId = member === "me" ? p.me ?? "" : member;
    const r = await api<{ events: CalEvent[] }>(`/api/calendar?from=${range.from}&to=${range.to}${memberId ? `&membro=${encodeURIComponent(memberId)}` : ""}`);
    setLoading(false);
    if (!r.ok) return toast(r.erro, "error");
    setEvents(r.data.events);
  }
  useEffect(() => {
    try { window.history.replaceState(null, "", `?visao=${view}&data=${anchor}`); } catch { /* sem histórico */ }
    if (first.current) { first.current = false; return; }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, range.from, range.to, member]);

  function toggle(k: EventKind | "all" | "none") {
    const next = k === "all" ? new Set<EventKind>() : k === "none" ? new Set(EVENT_KIND_KEYS) : new Set(hidden);
    if (k !== "all" && k !== "none") { if (next.has(k)) next.delete(k); else next.add(k); }
    setHidden(next);
    try { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...next])); } catch { /* sem armazenamento */ }
  }
  const needle = q.trim().toLowerCase();
  const matching = useMemo(() => events.filter((e) => !needle || `${e.title} ${e.detail ?? ""} ${e.customer?.name ?? ""} ${e.location ?? ""}`.toLowerCase().includes(needle)), [events, needle]);
  const counts = useMemo(() => { const c = new Map<EventKind, number>(); for (const e of matching) c.set(e.kind, (c.get(e.kind) ?? 0) + 1); return c; }, [matching]);
  const shown = matching.filter((e) => !hidden.has(e.kind));
  const go = (v: CalView, d: string) => { setView(v); setAnchor(d); };
  const create = (date: string) => p.canEdit && setForm({ ev: null, date });

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <aside className={`${filters ? "block" : "hidden"} w-full shrink-0 space-y-4 lg:block lg:w-64`} aria-label="Filtros do calendário">
        <MiniMonth anchor={anchor} today={p.today} onPick={(d) => setAnchor(d)} />
        <section className="card card-pad">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="kicker">Tipos de evento</h2>
            <button className="text-xs text-accent-light hover:underline" onClick={() => toggle(hidden.size ? "all" : "none")}>{hidden.size ? "Mostrar tudo" : "Ocultar tudo"}</button>
          </div>
          <ul className="space-y-1">
            {EVENT_KIND_KEYS.map((k) => (
              <li key={k}>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 text-sm hover:bg-panel2">
                  <input type="checkbox" className="sr-only" checked={!hidden.has(k)} onChange={() => toggle(k)} />
                  <span className="h-3 w-3 shrink-0 rounded-[4px] border-2" style={{ borderColor: EVENT_KINDS[k].color, backgroundColor: hidden.has(k) ? "transparent" : EVENT_KINDS[k].color }} aria-hidden />
                  <span className={`flex-1 ${hidden.has(k) ? "text-muted line-through" : ""}`}>{EVENT_KINDS[k].label}</span>
                  <span className="text-xs tabular-nums text-muted">{counts.get(k) ?? 0}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>
        <section className="card card-pad space-y-3">
          <Field label="Responsável">
            <select className="input" value={member} onChange={(e) => setMember(e.target.value)} aria-label="Responsável">
              <option value="">Todos</option>
              {p.me && <option value="me">Só os meus</option>}
              {p.members.filter((m) => m.id !== p.me).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </Field>
          <Field label="Buscar">
            <span className="relative block"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><input className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Título, cliente, local..." aria-label="Buscar eventos" /></span>
          </Field>
        </section>
      </aside>

      <section className="min-w-0 flex-1">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button className="btn-ghost h-9" onClick={() => setAnchor(p.today)}>Hoje</button>
          <div className="flex items-center rounded-xl border border-line bg-panel">
            <button className="btn-subtle h-9 w-9 px-0" onClick={() => setAnchor(stepAnchor(view, anchor, -1))} aria-label="Anterior"><ChevronLeft className="h-4 w-4" /></button>
            <button className="btn-subtle h-9 w-9 px-0" onClick={() => setAnchor(stepAnchor(view, anchor, 1))} aria-label="Próximo"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <h2 className="min-w-0 text-lg font-semibold first-letter:uppercase" aria-live="polite">{title(view, anchor)}{loading && <span className="ml-2 text-xs font-normal text-muted">carregando…</span>}</h2>
          <span className="flex-1" />
          <button className="btn-ghost h-9 lg:hidden" onClick={() => setFilters(!filters)} aria-expanded={filters}><Filter className="h-4 w-4" />Filtrar</button>
          <div className="inline-flex gap-1 rounded-xl border border-line bg-panel p-1" role="tablist" aria-label="Visualização">
            {VIEWS.map(([k, l]) => <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)} className={`rounded-lg px-3 py-1 text-sm font-medium ${view === k ? "bg-panel2 text-white shadow-sm" : "text-muted hover:text-zinc-100"}`}>{l}</button>)}
          </div>
          {p.canEdit && <button className="btn-ghost h-9" onClick={() => setImporting(true)}><Upload className="h-4 w-4" />Importar</button>}
          {p.feed && <button className="btn-ghost h-9" onClick={() => setGoogle(true)}><Link2 className="h-4 w-4" />Google Agenda</button>}
          {p.canEdit && <button className="btn-primary h-9" onClick={() => create(view === "mes" || view === "lista" ? (anchor.slice(0, 7) === p.today.slice(0, 7) ? p.today : anchor) : anchor)}><Plus className="h-4 w-4" />Criar</button>}
        </div>

        {view === "mes" && <MonthGrid range={range} anchor={anchor} today={p.today} events={shown} onOpen={setOpen} onDay={(d) => go("dia", d)} onCreate={p.canEdit ? create : null} />}
        {view === "semana" && <WeekGrid range={range} today={p.today} events={shown} onOpen={setOpen} onDay={(d) => go("dia", d)} onCreate={p.canEdit ? create : null} />}
        {view === "dia" && <DayList day={anchor} today={p.today} events={onDay(shown, anchor)} onOpen={setOpen} onCreate={p.canEdit ? create : null} />}
        {view === "lista" && <AgendaList range={range} today={p.today} events={shown} onOpen={setOpen} />}
      </section>

      {open && (
        <EventDetails ev={open} canEdit={p.canEdit} members={p.members} onClose={() => setOpen(null)}
          onEdit={() => { setForm({ ev: open, date: open.date }); setOpen(null); }}
          onDeleted={() => { setOpen(null); void load(); }} />
      )}
      {form && <EventForm ev={form.ev} date={form.date} members={p.members} customers={p.customers} canTask={p.canTask} onClose={() => setForm(null)} onSaved={() => { setForm(null); void load(); }} />}
      {importing && <ImportDialog onClose={() => setImporting(false)} onDone={() => { setImporting(false); void load(); }} />}
      {google && p.feed && <GoogleDialog feed={p.feed} onClose={() => setGoogle(false)} />}
    </div>
  );
}

/* ---------------- Peças ---------------- */

function Chip({ e, onOpen, compact }: { e: CalEvent; onOpen: (e: CalEvent) => void; compact?: boolean }) {
  const c = EVENT_KINDS[e.kind].color;
  return (
    <button type="button" onClick={(x) => { x.stopPropagation(); onOpen(e); }} title={`${EVENT_KINDS[e.kind].label}: ${e.title}`}
      className={`flex w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 text-left text-xs hover:brightness-125 ${compact ? "py-0.5" : "py-1"} ${e.done ? "opacity-60" : ""}`}
      style={{ backgroundColor: `${c}22`, borderLeft: `3px solid ${c}` }}>
      {e.time && <span className="shrink-0 tabular-nums text-muted">{e.time}</span>}
      <span className={`truncate ${e.done ? "line-through" : ""}`}>{e.title}</span>
    </button>
  );
}

function MiniMonth({ anchor, today, onPick }: { anchor: string; today: string; onPick: (d: string) => void }) {
  const [month, setMonth] = useState(`${anchor.slice(0, 7)}-01`);
  useEffect(() => setMonth(`${anchor.slice(0, 7)}-01`), [anchor]);
  const { from } = viewRange("mes", month);
  const days = Array.from({ length: 42 }, (_, i) => addDays(from, i));
  return (
    <section className="card card-pad" aria-label="Escolher o dia">
      <div className="mb-2 flex items-center gap-1">
        <span className="flex-1 text-sm font-semibold first-letter:uppercase">{fmt(month, { month: "long", year: "numeric" })}</span>
        <button className="btn-subtle h-7 w-7 px-0" onClick={() => setMonth(addMonths(month, -1))} aria-label="Mês anterior"><ChevronLeft className="h-4 w-4" /></button>
        <button className="btn-subtle h-7 w-7 px-0" onClick={() => setMonth(addMonths(month, 1))} aria-label="Próximo mês"><ChevronRight className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[11px]">
        {WEEKDAYS.map((w) => <span key={w} className="py-1 text-muted">{w[0]}</span>)}
        {days.map((d) => (
          <button key={d} onClick={() => onPick(d)} aria-label={fmt(d, { day: "numeric", month: "long" })} aria-current={d === today ? "date" : undefined}
            className={`h-7 rounded-md tabular-nums ${d === anchor ? "bg-accent text-white" : d === today ? "font-semibold text-accent-light" : d.slice(0, 7) === month.slice(0, 7) ? "hover:bg-panel2" : "text-muted/60 hover:bg-panel2"}`}>
            {Number(d.slice(8))}
          </button>
        ))}
      </div>
    </section>
  );
}

type GridProps = { range: { from: string; to: string }; today: string; events: CalEvent[]; onOpen: (e: CalEvent) => void; onDay: (d: string) => void; onCreate: ((d: string) => void) | null };

function MonthGrid({ range, anchor, today, events, onOpen, onDay: openDay, onCreate }: GridProps & { anchor: string }) {
  const days = Array.from({ length: 42 }, (_, i) => addDays(range.from, i));
  return (
    <div className="card overflow-hidden">
      <div className="grid grid-cols-7 border-b border-line text-center text-[11px] font-semibold text-muted">{WEEKDAYS.map((w) => <div key={w} className="py-2">{w}</div>)}</div>
      <div className="grid grid-cols-7">
        {days.map((d, i) => {
          const list = onDay(events, d);
          const out = d.slice(0, 7) !== anchor.slice(0, 7);
          return (
            <div key={d} onClick={() => onCreate?.(d)} className={`group min-h-[64px] border-line p-1 sm:min-h-[104px] ${i % 7 ? "border-l" : ""} ${i >= 7 ? "border-t" : ""} ${out ? "bg-panel2/30" : ""} ${onCreate ? "cursor-pointer" : ""}`}>
              <div className="mb-0.5 flex items-center">
                <button onClick={(x) => { x.stopPropagation(); openDay(d); }} aria-label={`Ver ${fmt(d, { day: "numeric", month: "long" })}`}
                  className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs tabular-nums ${d === today ? "bg-accent font-semibold text-white" : out ? "text-muted/60" : "hover:bg-panel2"}`}>{Number(d.slice(8))}</button>
                {onCreate && <Plus className="ml-auto hidden h-3.5 w-3.5 text-muted group-hover:block" aria-hidden />}
              </div>
              <div className="hidden space-y-0.5 sm:block">
                {list.slice(0, 3).map((e) => <Chip key={e.id} e={e} onOpen={onOpen} compact />)}
                {list.length > 3 && <button onClick={(x) => { x.stopPropagation(); openDay(d); }} className="px-1.5 text-[11px] text-accent-light hover:underline">+{list.length - 3} mais</button>}
              </div>
              {list.length > 0 && (
                <button onClick={(x) => { x.stopPropagation(); openDay(d); }} className="flex flex-wrap gap-0.5 sm:hidden" aria-label={`${list.length} eventos`}>
                  {list.slice(0, 4).map((e) => <span key={e.id} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: EVENT_KINDS[e.kind].color }} />)}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekGrid({ range, today, events, onOpen, onDay: openDay, onCreate }: GridProps) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(range.from, i));
  return (
    <div className="card grid divide-y divide-line lg:grid-cols-7 lg:divide-x lg:divide-y-0">
      {days.map((d) => {
        const list = onDay(events, d);
        return (
          <div key={d} className="min-h-[72px] p-2 lg:min-h-[420px]">
            <div className="mb-2 flex items-center gap-2 lg:flex-col lg:items-start lg:gap-0">
              <span className="text-[11px] font-semibold text-muted">{WEEKDAYS[weekday(d)]}</span>
              <button onClick={() => openDay(d)} className={`flex h-8 min-w-8 items-center justify-center rounded-full px-1 text-base font-semibold tabular-nums ${d === today ? "bg-accent text-white" : "hover:bg-panel2"}`} aria-label={`Ver ${fmt(d, { day: "numeric", month: "long" })}`}>{Number(d.slice(8))}</button>
              {onCreate && <button onClick={() => onCreate(d)} className="btn-subtle ml-auto h-7 w-7 px-0 lg:ml-0 lg:mt-1" aria-label={`Criar em ${dm(d)}`}><Plus className="h-3.5 w-3.5" /></button>}
            </div>
            <div className="space-y-1">{list.map((e) => <Chip key={e.id} e={e} onOpen={onOpen} />)}</div>
          </div>
        );
      })}
    </div>
  );
}

function Row({ e, onOpen }: { e: CalEvent; onOpen: (e: CalEvent) => void }) {
  const k = EVENT_KINDS[e.kind];
  return (
    <li>
      <button onClick={() => onOpen(e)} className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-panel2">
        <span className="w-14 shrink-0 whitespace-pre-line pt-0.5 text-xs tabular-nums text-muted">{e.time ? `${e.time}${e.endTime ? `\n${e.endTime}` : ""}` : "dia todo"}</span>
        <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: k.color }} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className={`block truncate font-medium ${e.done ? "text-muted line-through" : ""}`}>{e.title}</span>
          <span className="block truncate text-xs text-muted">{[k.label, e.endDate ? `${dm(e.date)} a ${dm(e.endDate)}` : null, e.detail, e.customer?.name, e.location].filter(Boolean).join(" · ")}</span>
        </span>
        {e.recurrence !== "NONE" && <Repeat className="mt-1 h-3.5 w-3.5 shrink-0 text-muted" aria-label="Repete" />}
      </button>
    </li>
  );
}

function DayList({ day, today, events, onOpen, onCreate }: { day: string; today: string; events: CalEvent[]; onOpen: (e: CalEvent) => void; onCreate: ((d: string) => void) | null }) {
  return (
    <div className="card card-pad">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="font-semibold first-letter:uppercase">{day === today ? "Hoje" : fmt(day, { weekday: "long" })}</h3>
        <span className="text-sm text-muted">{events.length} {events.length === 1 ? "evento" : "eventos"}</span>
        {onCreate && <button className="btn-ghost ml-auto h-8 text-xs" onClick={() => onCreate(day)}><Plus className="h-3.5 w-3.5" />Evento neste dia</button>}
      </div>
      {events.length ? <ul className="-mx-3">{events.map((e) => <Row key={e.id} e={e} onOpen={onOpen} />)}</ul> : <p className="py-8 text-center text-sm text-muted">Nada neste dia.</p>}
    </div>
  );
}

function AgendaList({ range, today, events, onOpen }: { range: { from: string; to: string }; today: string; events: CalEvent[]; onOpen: (e: CalEvent) => void }) {
  const days = Array.from({ length: 30 }, (_, i) => addDays(range.from, i)).map((d) => [d, onDay(events, d)] as const).filter(([, l]) => l.length);
  if (!days.length) return <div className="card card-pad py-10 text-center text-sm text-muted">Nada nos próximos 30 dias.</div>;
  return (
    <div className="card divide-y divide-line">
      {days.map(([d, list]) => (
        <section key={d} className="flex flex-col gap-1 p-3 sm:flex-row sm:gap-4" aria-label={fmt(d, { day: "numeric", month: "long" })}>
          <div className="w-28 shrink-0">
            <p className={`text-2xl font-semibold tabular-nums ${d === today ? "text-accent-light" : ""}`}>{Number(d.slice(8))}</p>
            <p className="text-xs text-muted first-letter:uppercase">{fmt(d, { weekday: "long" })}, {fmt(d, { month: "short" })}</p>
          </div>
          <ul className="min-w-0 flex-1 -mx-3 sm:mx-0">{list.map((e) => <Row key={e.id} e={e} onOpen={onOpen} />)}</ul>
        </section>
      ))}
    </div>
  );
}

/* ---------------- Detalhes e formulário ---------------- */

const SOURCE_LINK: Record<string, string> = { SALE: "Abrir a venda", TASK: "Abrir o quadro de tarefas", PASSENGER: "Abrir passageiros", HOLDER: "Abrir a Central de Contas", FINANCE: "Abrir o Financeiro", CARD: "Abrir a Central de Cartões" };

function EventDetails({ ev, canEdit, members, onClose, onEdit, onDeleted }: { ev: CalEvent; canEdit: boolean; members: Member[]; onClose: () => void; onEdit: () => void; onDeleted: () => void }) {
  const k = EVENT_KINDS[ev.kind];
  const who = ev.memberIds.map((id) => members.find((m) => m.id === id)?.name).filter(Boolean);
  async function remove() {
    if (!ev.eventId) return;
    const body = ev.recurrence !== "NONE" ? "Este evento repete: todas as repetições serão excluídas." : ev.title;
    if (!(await confirmDialog({ title: "Excluir evento?", body, confirmLabel: "Excluir", danger: true }))) return;
    const r = await api(`/api/calendar/events/${ev.eventId}`, "DELETE");
    if (!r.ok) return toast(r.erro, "error");
    toast("Evento excluído");
    onDeleted();
  }
  return (
    <Modal open onClose={onClose} title={ev.title} size="sm" icon={<span className="h-3 w-3 rounded-full" style={{ backgroundColor: k.color }} aria-hidden />}
      footer={<>
        {ev.editable && canEdit && <button className="btn-ghost mr-auto text-red-300" onClick={remove}><Trash2 className="h-4 w-4" />Excluir</button>}
        {ev.href && <Link href={ev.href} className="btn-ghost"><ExternalLink className="h-4 w-4" />{SOURCE_LINK[ev.source] ?? "Abrir"}</Link>}
        {ev.editable && canEdit && <button className="btn-primary" onClick={onEdit}><Pencil className="h-4 w-4" />Editar</button>}
      </>}>
      <dl className="space-y-2 text-sm">
        <div className="flex gap-2"><dt className="sr-only">Tipo</dt><dd><span className="rounded-md px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: `${k.color}22`, color: k.color }}>{k.label}</span>{ev.source === "IMPORT" && <span className="ml-2 text-xs text-muted">importado</span>}{!ev.editable && <span className="ml-2 text-xs text-muted">automático</span>}</dd></div>
        <div className="flex gap-2"><dt className="sr-only">Quando</dt><CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-muted" /><dd className="first-letter:uppercase">{when(ev)}{ev.recurrence !== "NONE" && ` · ${RECURRENCES[ev.recurrence].toLowerCase()}`}</dd></div>
        {ev.detail && <div className="text-muted">{ev.detail}</div>}
        {ev.customer && <div className="flex gap-2"><dt className="sr-only">Cliente</dt><UserRound className="mt-0.5 h-4 w-4 shrink-0 text-muted" /><dd>{ev.customer.name}</dd></div>}
        {ev.location && <div className="flex gap-2"><dt className="sr-only">Local</dt><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted" /><dd>{ev.location}</dd></div>}
        {who.length > 0 && <div><dt className="kicker">Responsáveis</dt><dd>{who.join(", ")}</dd></div>}
        {ev.notes && <div><dt className="kicker">Observações</dt><dd className="whitespace-pre-wrap">{ev.notes}</dd></div>}
      </dl>
    </Modal>
  );
}

type FormKind = EventKind;

function EventForm({ ev, date, members, customers, canTask, onClose, onSaved }: { ev: CalEvent | null; date: string; members: Member[]; customers: Customer[]; canTask: boolean; onClose: () => void; onSaved: () => void }) {
  const kinds: FormKind[] = ev ? [...MANUAL_KINDS] : [...MANUAL_KINDS, ...(canTask ? (["TASK"] as FormKind[]) : [])];
  const [kind, setKind] = useState<FormKind>(ev?.kind ?? "REMINDER");
  const [title, setTitle] = useState(ev?.title ?? "");
  const [start, setStart] = useState(ev?.seriesDate ?? date);
  const [allDay, setAllDay] = useState(ev ? !ev.time : true);
  const [time, setTime] = useState(ev?.time ?? "09:00");
  const [endTime, setEndTime] = useState(ev?.endTime ?? "");
  const [multi, setMulti] = useState(!!ev?.endDate);
  const [end, setEnd] = useState(ev?.endDate && ev.seriesDate ? addDays(ev.seriesDate, Math.round((Date.parse(ev.endDate) - Date.parse(ev.date)) / 86_400_000)) : "");
  const [recurrence, setRecurrence] = useState<Recurrence>(ev?.recurrence ?? "NONE");
  const [who, setWho] = useState<string[]>(ev?.memberIds ?? []);
  const [customerId, setCustomerId] = useState(ev?.customer?.id ?? "");
  const [location, setLocation] = useState(ev?.location ?? "");
  const [notes, setNotes] = useState(ev?.notes ?? "");
  const [remind, setRemind] = useState(ev?.remind ?? true);
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const isTask = kind === "TASK";
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    if (multi && end && end < start) return setErro("O último dia é antes do primeiro");
    setBusy(true);
    const r = isTask
      ? await api("/api/tasks", "POST", { title, priority: "MEDIUM", dueDate: start, dueTime: allDay ? null : time, memberIds: who, description: notes || null })
      : await api(ev?.eventId ? `/api/calendar/events/${ev.eventId}` : "/api/calendar/events", ev?.eventId ? "PUT" : "POST", {
          kind, title, date: start, endDate: multi && end ? end : null, time: allDay ? null : time, endTime: allDay ? null : endTime || null,
          recurrence, memberIds: who, customerId: customerId || null, location: location || null, notes: notes || null, remind,
        });
    setBusy(false);
    if (!r.ok) return setErro(r.erro);
    toast(isTask ? "Tarefa criada" : ev ? "Evento atualizado" : "Evento criado");
    onSaved();
  }
  return (
    <Modal open onClose={onClose} title={ev ? "Editar evento" : "Novo evento"} size="lg" icon={<CalendarDays className="h-5 w-5" />}
      footer={<><button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button form="event-form" className="btn-primary" disabled={busy}>Salvar</button></>}>
      <form id="event-form" onSubmit={save} className="space-y-4">
        {erro && <Alert>{erro}</Alert>}
        {ev && ev.recurrence !== "NONE" && <Alert kind="info">Este evento repete: a mudança vale para todas as repetições.</Alert>}
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Tipo"><select className="input" value={kind} onChange={(e) => setKind(e.target.value as FormKind)} aria-label="Tipo de evento">{kinds.map((k) => <option key={k} value={k}>{EVENT_KINDS[k].label}</option>)}</select></Field>
          <Field label="Título" required className="sm:col-span-2"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required placeholder={isTask ? "Ex.: Emitir o pedido da Maria" : "Ex.: Ligar para o cliente sobre o visto"} aria-label="Título" /></Field>
        </div>
        {isTask && <p className="text-xs text-muted">Vira uma tarefa no quadro de Tarefas, com o prazo neste dia.</p>}
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label={multi ? "Primeiro dia" : "Dia"} required><input type="date" className="input" value={start} onChange={(e) => setStart(e.target.value)} required aria-label="Dia" /></Field>
          {!allDay && <Field label="Início"><input type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} required aria-label="Horário de início" /></Field>}
          {!allDay && !isTask && <Field label="Fim"><input type="time" className="input" value={endTime} onChange={(e) => setEndTime(e.target.value)} aria-label="Horário de fim" /></Field>}
          {multi && !isTask && <Field label="Último dia"><input type="date" className="input" value={end} min={start} onChange={(e) => setEnd(e.target.value)} aria-label="Último dia" /></Field>}
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" className="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />Dia todo</label>
          {!isTask && <label className="flex items-center gap-2"><input type="checkbox" className="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} />Vários dias</label>}
          {!isTask && <label className="flex items-center gap-2"><input type="checkbox" className="checkbox" checked={remind} onChange={(e) => setRemind(e.target.checked)} />Avisar no dia</label>}
        </div>
        {!isTask && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Repetir"><select className="input" value={recurrence} onChange={(e) => setRecurrence(e.target.value as Recurrence)} aria-label="Repetir">{Object.entries(RECURRENCES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label="Cliente"><select className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)} aria-label="Cliente"><option value="">Nenhum</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            <Field label="Local"><input className="input" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={200} placeholder="Ex.: Consulado, GRU T3" aria-label="Local" /></Field>
          </div>
        )}
        {members.length > 0 && (
          <fieldset>
            <legend className="label">Responsáveis</legend>
            <div className="flex flex-wrap gap-1.5">
              {members.map((m) => {
                const on = who.includes(m.id);
                return <button type="button" key={m.id} aria-pressed={on} onClick={() => setWho(on ? who.filter((x) => x !== m.id) : [...who, m.id])} className={`rounded-full border px-3 py-1 text-xs ${on ? "border-accent bg-accent-soft text-white" : "border-line text-muted hover:text-zinc-100"}`}>{m.name}</button>;
              })}
            </div>
          </fieldset>
        )}
        <Field label="Observações"><textarea className="input h-auto min-h-[80px] py-2" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} aria-label="Observações" /></Field>
      </form>
    </Modal>
  );
}

function ImportDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<EventKind>("REMINDER");
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return setErro("Escolha o arquivo .ics");
    if (file.size > 3_000_000) return setErro("Arquivo grande demais (até 3 MB)");
    setBusy(true);
    const r = await api<{ created: number; updated: number }>("/api/calendar/import", "POST", { ics: await file.text(), kind });
    setBusy(false);
    if (!r.ok) return setErro(r.erro);
    toast(`${r.data.created} ${r.data.created === 1 ? "evento importado" : "eventos importados"}${r.data.updated ? ` · ${r.data.updated} atualizados` : ""}`);
    onDone();
  }
  return (
    <Modal open onClose={onClose} title="Importar eventos" size="sm" icon={<Upload className="h-5 w-5" />}
      footer={<><button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button form="import-form" className="btn-primary" disabled={busy}>Importar</button></>}>
      <form id="import-form" onSubmit={send} className="space-y-3">
        {erro && <Alert>{erro}</Alert>}
        <p className="text-sm text-muted">Envie um arquivo <b>.ics</b> exportado do Google Agenda (Configurações › Importar e exportar), do Outlook ou da Apple. Importar o mesmo arquivo de novo atualiza os eventos, sem duplicar.</p>
        <Field label="Arquivo"><input type="file" accept=".ics,text/calendar" className="input py-1.5" onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-label="Arquivo .ics" /></Field>
        <Field label="Entram como"><select className="input" value={kind} onChange={(e) => setKind(e.target.value as EventKind)} aria-label="Tipo dos eventos importados">{MANUAL_KINDS.map((k) => <option key={k} value={k}>{EVENT_KINDS[k].label}</option>)}</select></Field>
      </form>
    </Modal>
  );
}

function GoogleDialog({ feed, onClose }: { feed: Feed; onClose: () => void }) {
  const [state, setState] = useState(feed);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  async function generate() {
    if (state.active && !(await confirmDialog({ title: "Gerar um link novo?", body: "O link atual para de funcionar: no Google Agenda, troque pela nova URL.", confirmLabel: "Gerar novo" }))) return;
    setBusy(true);
    const r = await api<{ url: string }>("/api/calendar/feed", "POST");
    setBusy(false);
    if (!r.ok) return toast(r.erro, "error");
    setUrl(r.data.url);
    setState({ active: true, createdAt: new Date().toISOString() });
  }
  async function off() {
    if (!(await confirmDialog({ title: "Desligar o link?", body: "O Google Agenda deixa de receber os eventos.", confirmLabel: "Desligar", danger: true }))) return;
    const r = await api("/api/calendar/feed", "DELETE");
    if (!r.ok) return toast(r.erro, "error");
    setUrl("");
    setState({ active: false, createdAt: null });
    toast("Link desligado");
  }
  async function copy() {
    try { await navigator.clipboard.writeText(url); toast("Link copiado"); } catch { toast("Copie o link à mão", "error"); }
  }
  return (
    <Modal open onClose={onClose} title="Ver no Google Agenda" size="sm" icon={<Link2 className="h-5 w-5" />}
      footer={<>{state.active && <button className="btn-ghost mr-auto text-red-300" onClick={off}>Desligar</button>}<button className="btn-ghost" onClick={onClose}>Fechar</button><button className="btn-primary" onClick={generate} disabled={busy}>{state.active ? "Gerar link novo" : "Gerar link"}</button></>}>
      <div className="space-y-3 text-sm">
        <p className="text-muted">O Google Agenda assina o calendário da agência por um link secreto (os eventos de 60 dias atrás até um ano para frente). As mudanças chegam lá sozinhas, no ritmo do Google (pode levar algumas horas).</p>
        {url ? (
          <>
            <Alert kind="ok">Link gerado. Ele só aparece agora: copie e guarde.</Alert>
            <div className="flex gap-2"><input className="input font-mono text-xs" readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Link do calendário" /><button className="btn-ghost h-10 shrink-0" onClick={copy}><Copy className="h-4 w-4" />Copiar</button></div>
            <ol className="list-decimal space-y-1 pl-5 text-muted">
              <li>No Google Agenda (computador), em <b>Outras agendas</b>, clique em <b>+</b> › <b>Do URL</b>.</li>
              <li>Cole o link e clique em <b>Adicionar agenda</b>.</li>
            </ol>
          </>
        ) : state.active ? (
          <p>Link ativo desde {new Date(state.createdAt!).toLocaleDateString("pt-BR")}. Para ver a URL de novo, gere um link novo.</p>
        ) : (
          <p>Nenhum link ativo.</p>
        )}
        <p className="text-xs text-muted">Quem tiver o link vê os eventos (clientes, rotas, vencimentos): não compartilhe.</p>
      </div>
    </Modal>
  );
}
