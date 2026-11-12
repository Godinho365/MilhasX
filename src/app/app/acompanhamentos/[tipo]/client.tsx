"use client";
// Lista de uma aba dos acompanhamentos (voos, hospedagens, transportes, cruzeiros, seguros, adicionais):
// indicadores, busca, períodos prontos ou personalizado, filtros, as linhas por dia e a marcação de cada
// trecho (check-in feito, reserva confirmada), com o atalho para completar companhia e horários.
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Search, Plane, BedDouble, Car, Ship, ShieldCheck, PackagePlus, Wallet, Users, TriangleAlert, CircleCheck, Circle, Pencil, ExternalLink,
  SlidersHorizontal, CalendarRange, Clock, X, type LucideIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { fmtBRL } from "@/lib/format";
import { Modal, Field, Alert, Empty } from "@/components/ui";
import { toast } from "@/components/feedback";
import { DateRangePicker, type DayRange } from "@/components/date-range";
import { placeName } from "@/domain/geo";
import { SALE_ITEM_LABELS, isSaleItemKind, itemFields } from "@/domain/sale-items";
import { addDays, diffDays } from "@/domain/calendar";
import {
  PERIODS, TRACK_TABS, byWhen, isPending, matches, pendingWindow, rowStatus, rowTitle, trackKpis,
  type Period, type TrackRow, type TrackTab, type Tone,
} from "@/domain/tracking";
import type { TrackingList } from "@/server/services/tracking";

type Member = { id: string; name: string; color: string };
type Only = "" | "pending" | "missing" | "done" | "open";

const ICONS: Record<TrackTab, LucideIcon> = { voos: Plane, hospedagens: BedDouble, transportes: Car, cruzeiros: Ship, seguros: ShieldCheck, adicionais: PackagePlus };
const TONES: Record<Tone, string> = {
  muted: "bg-panel2 text-muted", accent: "bg-accent-soft text-accent-light", ok: "bg-green-400/10 text-green-400", warn: "bg-amber-400/10 text-amber-400", info: "bg-blue-400/10 text-blue-400",
};
const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const plural = (n: number, one: string, many: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? one : many}`;

function dayTitle(d: string, today: string) {
  const n = diffDays(d, today);
  if (n === 0) return "Hoje";
  if (n === 1) return "Amanhã";
  if (n === -1) return "Ontem";
  const s = new Date(`${d}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC", ...(d.slice(0, 4) !== today.slice(0, 4) ? { year: "numeric" } : {}) });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function Kpi({ label, value, hint, icon, onClick, active, warn }: { label: string; value: string; hint: string; icon: React.ReactNode; onClick?: () => void; active?: boolean; warn?: boolean }) {
  const body = (
    <>
      <div className="flex items-start gap-2">
        <p className="kicker">{label}</p>
        <span className={`ml-auto ${warn ? "text-amber-400" : "text-muted"}`}>{icon}</span>
      </div>
      <p className={`mt-2 text-2xl font-semibold tabular-nums tracking-tight ${warn ? "text-amber-400" : ""}`}>{value}</p>
      <p className="mt-1 text-xs text-muted">{hint}</p>
    </>
  );
  if (!onClick) return <div className="card card-pad">{body}</div>;
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={`card card-pad text-left transition-colors hover:border-zinc-600 ${active ? "border-accent-light ring-1 ring-accent-light" : ""}`}>{body}</button>
  );
}

export function TrackingClient({ tab, initial, members, canEdit, me }: { tab: TrackTab; initial: TrackingList; members: Member[]; canEdit: boolean; me: string | null }) {
  const t = TRACK_TABS[tab];
  const Icon = ICONS[tab];
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [member, setMember] = useState("");
  const [only, setOnly] = useState<Only>("");
  const [provider, setProvider] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [showRange, setShowRange] = useState(initial.period === "custom");
  const [editing, setEditing] = useState<TrackRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const today = data.today;
  const fields = itemFields(t.kinds[0]);

  async function load(period: Period, range?: DayRange) {
    setLoading(true);
    const qs = new URLSearchParams({ tipo: tab, periodo: period });
    if (period === "custom" && range) { qs.set("de", range.from); qs.set("ate", range.to); }
    const r = await api<TrackingList>(`/api/tracking?${qs}`);
    setLoading(false);
    if (!r.ok) return toast(r.erro, "error");
    setData(r.data);
    const url = new URL(window.location.href);
    for (const k of ["periodo", "de", "ate"]) url.searchParams.delete(k);
    if (period !== "proximos") url.searchParams.set("periodo", period);
    if (period === "custom" && range) { url.searchParams.set("de", range.from); url.searchParams.set("ate", range.to); }
    window.history.replaceState(window.history.state, "", url);
  }

  /** Troca as linhas do item pelas que o servidor devolveu (mantém as que estão no período). */
  function merge(rows: TrackRow[]) {
    const byId = new Map(rows.map((r) => [r.id, r]));
    setData((d) => ({ ...d, rows: d.rows.map((r) => byId.get(r.id) ?? r) }));
  }

  async function toggle(r: TrackRow) {
    if (!canEdit) return;
    setBusy(r.id);
    const r2 = await api<{ rows: TrackRow[] }>(`/api/tracking/items/${encodeURIComponent(r.itemId)}`, "PATCH", r.leg === "RET" ? { doneRet: !r.done } : { doneOut: !r.done });
    setBusy(null);
    if (!r2.ok) return toast(r2.erro, "error");
    merge(r2.data.rows);
  }

  const providers = useMemo(() => [...new Set(data.rows.map((r) => r.provider?.trim()).filter((p): p is string => !!p))].sort((a, b) => a.localeCompare(b, "pt-BR")), [data.rows]);
  const rows = useMemo(() => data.rows.filter((r) =>
    matches(r, q)
    && (member === "" || (member === "none" ? r.issuerIds.length === 0 : r.issuerIds.includes(member === "me" ? me ?? "" : member)))
    && (only === "" || (only === "pending" ? isPending(r, today) : only === "missing" ? !r.provider?.trim() : only === "done" ? r.done : !r.done))
    && (!provider || r.provider?.trim() === provider),
  ), [data.rows, q, member, me, only, provider, today]);
  const k = trackKpis(rows, today);
  const filtered = !!(q.trim() || member || only || provider);
  const filterCount = [member, only === "done" || only === "open" ? only : "", provider].filter(Boolean).length;

  const groups = useMemo(() => {
    const m = new Map<string, TrackRow[]>();
    const ongoing = rows.filter((r) => rowStatus(r, today).key === "ongoing");
    if (ongoing.length) m.set("agora", []); // "Em andamento" primeiro
    for (const r of [...rows].sort(byWhen)) {
      const key = rowStatus(r, today).key === "ongoing" ? "agora" : r.date;
      m.set(key, [...(m.get(key) ?? []), r]);
    }
    return [...m.entries()];
  }, [rows, today]);

  const prev = data.prevValueCents;
  const valueHint = filtered
    ? "com os filtros"
    : prev == null ? plural(k.reservations, "reserva", "reservas")
    : prev === 0 ? (k.valueCents > 0 ? "nada no período anterior" : "igual ao período anterior")
    : (() => { const p = Math.round(((k.valueCents - prev) / prev) * 100); return `${p >= 0 ? "↗" : "↘"} ${Math.abs(p)}% vs período anterior`; })();
  const rangeText = data.range.from && data.range.to ? `${dm(data.range.from)} a ${dm(data.range.to)}` : data.period === "todos" ? "do último ano em diante" : "de hoje em diante";
  const pendingHint = tab === "voos" ? `embarques nos próximos ${pendingWindow("FLIGHT")} dias` : `nos próximos ${pendingWindow(t.kinds[0])} dias`;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Valor total" value={fmtBRL(k.valueCents)} hint={valueHint} icon={<Wallet className="h-4 w-4" />} />
        <Kpi label={`${t.label} no período`} value={k.count.toLocaleString("pt-BR")} hint={rangeText} icon={<Icon className="h-4 w-4" />} />
        <Kpi label={t.people} value={k.people.toLocaleString("pt-BR")} hint={`em ${plural(k.reservations, "reserva", "reservas")}`} icon={<Users className="h-4 w-4" />} />
        <Kpi label={t.pending} value={k.pending.toLocaleString("pt-BR")} hint={k.pending ? pendingHint : "nenhuma pendência"} icon={<Clock className="h-4 w-4" />} warn={k.pending > 0} onClick={() => setOnly(only === "pending" ? "" : "pending")} active={only === "pending"} />
        <Kpi label={t.missing} value={k.missing.toLocaleString("pt-BR")} hint={k.missing ? "falta informar" : "nenhuma pendência"} icon={<TriangleAlert className="h-4 w-4" />} warn={k.missing > 0} onClick={() => setOnly(only === "missing" ? "" : "missing")} active={only === "missing"} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input pl-9" placeholder={`Buscar cliente, passageiro, ${tab === "voos" ? "rota, companhia" : "lugar, fornecedor"} ou localizador`} value={q} onChange={(e) => setQ(e.target.value)} aria-label={`Buscar ${t.many}`} />
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="inline-flex gap-1 rounded-xl border border-line bg-panel p-1" role="tablist" aria-label="Período">
            {PERIODS.map((p) => (
              <button key={p.key} type="button" role="tab" aria-selected={data.period === p.key} disabled={loading}
                onClick={() => { setShowRange(false); void load(p.key); }}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${data.period === p.key ? "bg-panel2 text-white" : "text-muted hover:text-zinc-100"}`}>
                {p.label} <span className="ml-0.5 text-xs tabular-nums opacity-70">{data.counts[p.key]}</span>
              </button>
            ))}
          </div>
          <button type="button" className={`btn-ghost h-10 ${data.period === "custom" ? "border-accent-light text-white" : ""}`} onClick={() => setShowRange((s) => !s)} aria-expanded={showRange}><CalendarRange className="h-4 w-4" />Período</button>
          <button type="button" className={`btn-ghost h-10 ${filterCount ? "border-accent-light text-white" : ""}`} onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters}>
            <SlidersHorizontal className="h-4 w-4" />Filtros{filterCount ? <span className="rounded-full bg-accent px-1.5 text-xs text-white">{filterCount}</span> : null}
          </button>
        </div>
      </div>

      {showRange && (
        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker value={data.period === "custom" && data.range.from && data.range.to ? { from: data.range.from, to: data.range.to } : { from: today, to: addDays(today, 30) }} onChange={(r) => { if (r) void load("custom", r); }} />
          <p className="text-xs text-muted">Escolha o primeiro e o último dia (até dois anos).</p>
        </div>
      )}

      {showFilters && (
        <div className="card card-pad grid gap-3 sm:grid-cols-3">
          <Field label="Responsável">
            <select className="input" value={member} onChange={(e) => setMember(e.target.value)} aria-label="Filtrar por responsável">
              <option value="">Todos</option>
              {me && <option value="me">Só os meus</option>}
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              <option value="none">Sem responsável</option>
            </select>
          </Field>
          <Field label="Situação">
            <select className="input" value={only} onChange={(e) => setOnly(e.target.value as Only)} aria-label="Filtrar por situação">
              <option value="">Todas</option>
              <option value="open">{`Sem "${fields.done.toLowerCase()}"`}</option>
              <option value="done">{fields.done}</option>
              <option value="pending">{t.pending}</option>
              <option value="missing">{t.missing}</option>
            </select>
          </Field>
          <Field label={fields.provider}>
            <select className="input" value={provider} onChange={(e) => setProvider(e.target.value)} aria-label={`Filtrar por ${fields.provider.toLowerCase()}`}>
              <option value="">Todos</option>
              {providers.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          {filterCount > 0 && <button type="button" className="btn-subtle h-9 justify-self-start sm:col-span-3" onClick={() => { setMember(""); setOnly(""); setProvider(""); }}><X className="h-4 w-4" />Limpar filtros</button>}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <p aria-live="polite">{loading ? "Carregando..." : plural(rows.length, t.one, t.many)}</p>
        {data.undated > 0 && <p>{plural(data.undated, `${t.one} sem data não aparece`, `${t.many} sem data não aparecem`)} aqui: complete a data na venda.</p>}
      </div>

      {rows.length === 0 ? (
        <Empty title={t.none} icon={<Icon className="h-5 w-5" />}>
          <p className="max-w-sm text-sm text-muted">
            {filtered ? "Tente buscar por outro nome ou limpar os filtros." : data.counts.todos === 0 ? `Os ${t.many} aparecem aqui quando a venda tem o item com a data de ${fields.start.toLowerCase()}.` : "Nada neste período. Veja os outros períodos acima."}
          </p>
        </Empty>
      ) : (
        <div className="space-y-4">
          {groups.map(([key, list]) => (
            <section key={key} aria-label={key === "agora" ? "Em andamento" : dayTitle(key, today)} className="card overflow-hidden">
              <h2 className="flex items-center justify-between border-b border-line bg-panel2/50 px-4 py-2 text-sm font-semibold">
                <span>{key === "agora" ? "Em andamento" : dayTitle(key, today)}</span>
                <span className="text-xs font-normal text-muted">{plural(list.length, t.one, t.many)}</span>
              </h2>
              <ul className="divide-y divide-line">
                {list.map((r) => <RowItem key={r.id} r={r} today={today} canEdit={canEdit} busy={busy === r.id} onToggle={() => void toggle(r)} onEdit={() => setEditing(r)} />)}
              </ul>
            </section>
          ))}
        </div>
      )}

      {editing && <EditDialog row={editing} onClose={() => setEditing(null)} onSaved={(rows) => { merge(rows); setEditing(null); toast("Salvo"); }} />}
    </div>
  );
}

function RowItem({ r, today, canEdit, busy, onToggle, onEdit }: { r: TrackRow; today: string; canEdit: boolean; busy: boolean; onToggle: () => void; onEdit: () => void }) {
  const f = itemFields(r.kind);
  const st = rowStatus(r, today);
  const pending = isPending(r, today);
  const route = r.from || r.to;
  const where = route ? `${placeName(r.from) ?? "?"} → ${placeName(r.to) ?? "?"}` : placeName(r.place);
  const kindLabel = r.leg === "OUT" ? "Ida" : r.leg === "RET" ? "Volta" : isSaleItemKind(r.kind) ? SALE_ITEM_LABELS[r.kind] : r.kind;
  const nights = r.endDate ? diffDays(r.endDate, r.date) : 0;
  const span = r.endDate
    ? `${dm(r.date)}${r.time ? ` ${r.time}` : ""} → ${dm(r.endDate)}${r.endTime ? ` ${r.endTime}` : ""}${r.kind === "HOTEL" ? ` · ${nights} ${nights === 1 ? "noite" : "noites"}` : r.kind === "INSURANCE" ? ` · ${nights + 1} dias` : ""}`
    : null;
  const people = r.customers.length ? r.customers.map((c) => c.name).join(", ") : "Sem cliente";
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <div className="w-12 shrink-0 text-center">
        <p className="text-sm font-semibold tabular-nums">{r.time ?? "—"}</p>
        <p className="text-[11px] text-muted">{dm(r.date)}</p>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold">{rowTitle(r)}</p>
          <span className="pill">{kindLabel}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TONES[st.tone]}`}>{st.label}</span>
          {pending && <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-xs font-medium text-amber-400">{r.kind === "FLIGHT" ? "Check-in pendente" : "A confirmar"}</span>}
        </div>
        {(where || span) && <p className="mt-0.5 text-sm text-muted">{[route || rowTitle(r) !== where ? where : null, span].filter(Boolean).join(" · ")}</p>}
        <p className="mt-0.5 text-sm">
          <span>{people}</span>
          {r.passengers != null && <span className="text-muted"> · {plural(r.passengers, "passageiro", "passageiros")}</span>}
          <span className="text-muted"> · </span>
          {r.provider ? <span>{r.provider}</span> : <span className="text-amber-400">{`Sem ${f.provider.toLowerCase()}`}{r.program ? <span className="text-muted"> (emitido com {r.program})</span> : null}</span>}
          {r.reservation && <span className="text-muted"> · Localizador <span className="font-mono text-zinc-200">{r.reservation}</span></span>}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <button type="button" onClick={onToggle} disabled={!canEdit || busy} aria-pressed={r.done}
          className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-sm font-medium ${r.done ? "border-green-400/40 bg-green-400/10 text-green-400" : "border-line text-muted hover:text-zinc-100"} disabled:cursor-default disabled:opacity-70`}
          title={canEdit ? undefined : "Só quem edita vendas pode marcar"}>
          {r.done ? <CircleCheck className="h-4 w-4" /> : <Circle className="h-4 w-4" />}{f.done}
        </button>
        {canEdit && <button type="button" className="btn-subtle h-9 w-9 px-0" onClick={onEdit} aria-label={`Completar ${rowTitle(r)}`}><Pencil className="h-4 w-4" /></button>}
        <Link href={`/app/sales?edit=${encodeURIComponent(r.saleId)}`} className="btn-subtle h-9 w-9 px-0" aria-label="Abrir a venda" title="Abrir a venda"><ExternalLink className="h-4 w-4" /></Link>
      </div>
    </li>
  );
}

function EditDialog({ row, onClose, onSaved }: { row: TrackRow; onClose: () => void; onSaved: (rows: TrackRow[]) => void }) {
  const f = itemFields(row.kind);
  const [provider, setProvider] = useState(row.provider ?? "");
  const [time, setTime] = useState(row.time ?? "");
  const [endTime, setEndTime] = useState(row.endTime ?? "");
  const [done, setDone] = useState(row.done);
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const ret = row.leg === "RET";
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const body: Record<string, unknown> = { provider: provider.trim() || null };
    if (f.times) {
      body[ret ? "returnTime" : "departureTime"] = time || null;
      if (row.leg === "STAY" && row.hasReturn) body.returnTime = endTime || null;
    }
    body[ret ? "doneRet" : "doneOut"] = done;
    const r = await api<{ rows: TrackRow[] }>(`/api/tracking/items/${encodeURIComponent(row.itemId)}`, "PATCH", body);
    setBusy(false);
    if (!r.ok) return setErro(r.erro);
    onSaved(r.data.rows);
  }
  const label = row.leg === "OUT" ? f.start : row.leg === "RET" ? f.end : f.start;
  return (
    <Modal open onClose={onClose} title={rowTitle(row)} size="sm">
      <form onSubmit={save} className="space-y-4">
        <p className="text-sm text-muted">{row.leg === "STAY" ? (isSaleItemKind(row.kind) ? SALE_ITEM_LABELS[row.kind] : "") : row.leg === "OUT" ? "Ida" : "Volta"} de {dm(row.date)}{row.customers.length ? ` · ${row.customers.map((c) => c.name).join(", ")}` : ""}</p>
        <Field label={f.provider} hint={row.leg !== "STAY" ? "Vale para a ida e a volta" : undefined}>
          <input className="input" maxLength={80} placeholder={f.providerHint} value={provider} onChange={(e) => setProvider(e.target.value)} aria-label={f.provider} />
        </Field>
        {f.times && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={`Horário de ${label.toLowerCase()}`}><input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label={`Horário de ${label.toLowerCase()}`} /></Field>
            {row.leg === "STAY" && row.hasReturn && <Field label={`Horário de ${f.end.toLowerCase()}`}><input className="input" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} aria-label={`Horário de ${f.end.toLowerCase()}`} /></Field>}
          </div>
        )}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="checkbox" checked={done} onChange={(e) => setDone(e.target.checked)} />{f.done}{row.leg !== "STAY" ? (ret ? " (volta)" : " (ida)") : ""}</label>
        {erro && <Alert>{erro}</Alert>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" disabled={busy}>{busy ? "Salvando..." : "Salvar"}</button>
        </div>
      </form>
    </Modal>
  );
}
