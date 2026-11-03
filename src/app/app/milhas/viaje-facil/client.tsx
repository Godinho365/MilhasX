"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Plane, Pencil, Trash2, CircleCheck, Undo2, Hourglass, AlertTriangle, Coins, CalendarClock } from "lucide-react";
import { api, today } from "@/lib/api";
import { refreshSafe } from "@/lib/nav";
import { fmtDate, fmtPts } from "@/lib/format";
import { Modal, Field, Alert, Empty } from "@/components/ui";
import { Stat } from "@/components/stat";
import { toast, confirmDialog } from "@/components/feedback";
import { CABIN_LABELS, type DeadlineStatus } from "@/domain/viaje-facil";
import type { ViajeFacilView } from "@/server/services/miles";

type Totals = { open: number; miles: number; overdue: number; soon: number; missingMiles: number };

const BADGE: Record<DeadlineStatus, string> = {
  paid: "bg-emerald-500/15 text-emerald-300",
  overdue: "bg-red-500/15 text-red-300",
  today: "bg-red-500/15 text-red-300",
  soon: "bg-amber-500/15 text-amber-300",
  ok: "bg-panel2 text-zinc-300",
};
function statusLabel(v: ViajeFacilView) {
  if (v.status === "paid") return `Quitada${v.paidAt ? ` em ${fmtDate(v.paidAt)}` : ""}`;
  if (v.status === "overdue") return `Venceu há ${-v.days} ${v.days === -1 ? "dia" : "dias"}`;
  if (v.status === "today") return "Vence hoje";
  return `Vence em ${v.days} ${v.days === 1 ? "dia" : "dias"}`;
}

export function ViajeFacilClient({ items, totals, customers }: { items: ViajeFacilView[]; totals: Totals; customers: string[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<ViajeFacilView | "new" | null>(null);

  async function paid(v: ViajeFacilView, value: boolean) {
    if (value && !(await confirmDialog({ title: "Reserva quitada?", body: `Marcar as ${fmtPts(v.miles)} milhas de ${v.customerName} como pagas na Smiles?`, confirmLabel: "Marcar quitada" }))) return;
    const r = await api(`/api/viaje-facil/${v.id}/paid`, "POST", { paid: value });
    if (!r.ok) return toast(r.erro, "error");
    toast(value ? "Reserva quitada" : "Reserva voltou a ficar em aberto");
    refreshSafe(router);
  }
  async function remove(v: ViajeFacilView) {
    if (!(await confirmDialog({ title: "Excluir entrada?", body: `${v.customerName} · ${fmtPts(v.miles)} milhas`, confirmLabel: "Excluir", danger: true }))) return;
    const r = await api(`/api/viaje-facil/${v.id}`, "DELETE");
    if (!r.ok) return toast(r.erro, "error");
    toast("Entrada excluída");
    refreshSafe(router);
  }

  return (
    <>
      {items.length === 0 ? (
        <Empty title="Comece seu radar de milhas" icon={<Hourglass className="h-5 w-5" />}>
          <p className="max-w-sm text-sm text-muted">Registre as reservas Smiles feitas no ViajeFácil com a data limite para quitar em milhas e acompanhe tudo num lugar só.</p>
          <button className="btn-primary" onClick={() => setEditing("new")}><Plus className="h-4 w-4" />Nova entrada</button>
        </Empty>
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
            <Stat icon={<Hourglass className="h-4 w-4" />} label="Em aberto" value={String(totals.open)} hint={`${items.length - totals.open} quitadas`} />
            <Stat icon={<Coins className="h-4 w-4" />} label="Milhas a quitar" value={fmtPts(totals.miles)} hint={totals.missingMiles ? `${fmtPts(totals.missingMiles)} ainda sem saldo do cliente` : "todos já têm o saldo"} />
            <Stat icon={<CalendarClock className="h-4 w-4" />} label="Vencem em 7 dias" value={String(totals.soon)} />
            <Stat icon={<AlertTriangle className="h-4 w-4" />} label="Vencidas" value={String(totals.overdue)} negative={totals.overdue > 0} />
          </div>
          <div className="mb-3 flex justify-end"><button className="btn-primary" onClick={() => setEditing("new")}><Plus className="h-4 w-4" />Nova entrada</button></div>
          <ul className="card divide-y divide-line overflow-hidden" aria-label="Reservas no radar">
            {items.map((v) => (
              <li key={v.id} className={`flex flex-wrap items-center gap-3 px-5 py-4 ${v.status === "paid" ? "opacity-60" : ""}`}>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    {v.customerName}
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[v.status]}`}>{statusLabel(v)}</span>
                    {v.status !== "paid" && (v.milesInAccount ? <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-300">Cliente já tem as milhas</span> : <span className="rounded-full bg-panel2 px-2 py-0.5 text-xs text-muted">Sem saldo do cliente</span>)}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-muted">
                    <span className="tabular-nums">Até {fmtDate(v.deadline)}</span>
                    {(v.origin || v.destination) && <span className="flex items-center gap-1"><Plane className="h-3.5 w-3.5" />{v.origin ?? "?"} {v.roundTrip ? "⇄" : "→"} {v.destination ?? "?"}</span>}
                    {v.cabin && <span>{CABIN_LABELS[v.cabin]}</span>}
                    {v.passengers.length > 0 && <span>{v.passengers.length} {v.passengers.length === 1 ? "passageiro" : "passageiros"}</span>}
                  </p>
                  {v.notes && <p className="mt-1 truncate text-xs text-muted">{v.notes}</p>}
                </div>
                <p className="text-right text-lg font-semibold tabular-nums">{fmtPts(v.miles)}<span className="block text-xs font-normal text-muted">milhas Smiles</span></p>
                <div className="flex gap-1">
                  {v.status === "paid"
                    ? <button className="btn-subtle h-8 w-8 px-0" onClick={() => paid(v, false)} aria-label={`Reabrir a reserva de ${v.customerName}`} title="Voltar a ficar em aberto"><Undo2 className="h-4 w-4" /></button>
                    : <button className="btn-subtle h-8 w-8 px-0 text-emerald-300" onClick={() => paid(v, true)} aria-label={`Marcar quitada a reserva de ${v.customerName}`} title="Marcar quitada"><CircleCheck className="h-4 w-4" /></button>}
                  <button className="btn-subtle h-8 w-8 px-0" onClick={() => setEditing(v)} aria-label={`Editar a reserva de ${v.customerName}`}><Pencil className="h-4 w-4" /></button>
                  <button className="btn-subtle h-8 w-8 px-0" onClick={() => remove(v)} aria-label={`Excluir a reserva de ${v.customerName}`}><Trash2 className="h-4 w-4" /></button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {editing && <EntryDialog entry={editing === "new" ? null : editing} customers={customers} onClose={() => setEditing(null)} />}
    </>
  );
}

function EntryDialog({ entry, customers, onClose }: { entry: ViajeFacilView | null; customers: string[]; onClose: () => void }) {
  const router = useRouter();
  const [f, setF] = useState({
    customerName: entry?.customerName ?? "",
    deadline: entry?.deadline.slice(0, 10) ?? "",
    miles: entry ? fmtPts(entry.miles) : "",
    roundTrip: entry?.roundTrip ?? false,
    origin: entry?.origin ?? "",
    destination: entry?.destination ?? "",
    cabin: entry?.cabin ?? "",
    passengers: entry?.passengers ?? [],
    milesInAccount: entry?.milesInAccount ?? false,
    notes: entry?.notes ?? "",
  });
  const [pax, setPax] = useState("");
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof f>) => setF({ ...f, ...patch });
  const addPax = () => { if (pax.trim()) set({ passengers: [...f.passengers, pax.trim()] }); setPax(""); };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const miles = Number(f.miles.replace(/\D/g, ""));
    if (!f.deadline) return setErro("Informe a data limite");
    setBusy(true);
    const body = { ...f, miles, cabin: f.cabin || null, origin: f.origin || null, destination: f.destination || null, notes: f.notes || null, passengers: pax.trim() ? [...f.passengers, pax.trim()] : f.passengers };
    const r = entry ? await api(`/api/viaje-facil/${entry.id}`, "PUT", body) : await api("/api/viaje-facil", "POST", body);
    setBusy(false);
    if (!r.ok) return setErro(r.erro);
    toast(entry ? "Entrada atualizada" : "Entrada no radar");
    onClose();
    refreshSafe(router);
  }

  return (
    <Modal open onClose={onClose} title={entry ? "Editar entrada" : "Nova entrada no radar"} icon={<Hourglass className="h-5 w-5" />}
      footer={<><button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button form="vf-form" className="btn-primary" disabled={busy}>Salvar</button></>}>
      <form id="vf-form" onSubmit={save} className="space-y-4">
        <p className="text-sm text-muted">Milhas Smiles com prazo de validade: você acompanha e age antes de vencer.</p>
        {erro && <Alert>{erro}</Alert>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Cliente" required className="sm:col-span-2">
            <input className="input" list="vf-customers" value={f.customerName} onChange={(e) => set({ customerName: e.target.value })} maxLength={120} required aria-label="Cliente" />
            <datalist id="vf-customers">{customers.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
          <Field label="Data limite" required><input className="input" type="date" min={entry ? undefined : today()} value={f.deadline} onChange={(e) => set({ deadline: e.target.value })} required aria-label="Data limite" /></Field>
          <Field label="Quantidade de milhas" required><input className="input" inputMode="numeric" value={f.miles} onChange={(e) => set({ miles: e.target.value })} placeholder="Ex.: 45.000" required aria-label="Quantidade de milhas" /></Field>
          <Field label="Origem"><input className="input uppercase" value={f.origin} onChange={(e) => set({ origin: e.target.value.toUpperCase().slice(0, 3) })} placeholder="GRU" aria-label="Origem" /></Field>
          <Field label="Destino"><input className="input uppercase" value={f.destination} onChange={(e) => set({ destination: e.target.value.toUpperCase().slice(0, 3) })} placeholder="LIS" aria-label="Destino" /></Field>
          <Field label="Cabine">
            <select className="input" value={f.cabin} onChange={(e) => set({ cabin: e.target.value })} aria-label="Cabine">
              <option value="">—</option>
              {Object.entries(CABIN_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={f.roundTrip} onChange={(e) => set({ roundTrip: e.target.checked })} />Ida e volta</label>
        </div>
        <Field label="Passageiros">
          <div className="flex gap-2">
            <input className="input" value={pax} onChange={(e) => setPax(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPax(); } }} placeholder="Nome do passageiro" aria-label="Nome do passageiro" />
            <button type="button" className="btn-ghost" onClick={addPax}>Adicionar</button>
          </div>
        </Field>
        {f.passengers.length > 0 && (
          <ul className="flex flex-wrap gap-1">{f.passengers.map((p, i) => <li key={`${p}-${i}`}><button type="button" className="rounded-full bg-panel2 px-2 py-0.5 text-xs" onClick={() => set({ passengers: f.passengers.filter((_, j) => j !== i) })} aria-label={`Tirar ${p}`}>{p} ✕</button></li>)}</ul>
        )}
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={f.milesInAccount} onChange={(e) => set({ milesInAccount: e.target.checked })} />
          <span>Milhas já estão na conta do cliente<span className="block text-xs text-muted">Marque se o cliente já tem o saldo para quitar esta reserva.</span></span>
        </label>
        <Field label="Observações"><textarea className="input min-h-20" value={f.notes} onChange={(e) => set({ notes: e.target.value })} maxLength={1000} /></Field>
      </form>
    </Modal>
  );
}
