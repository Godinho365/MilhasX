"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, MapPin, Send } from "lucide-react";
import { api } from "@/lib/api";
import { useNav, refreshSafe } from "@/lib/nav";
import { fmtDate } from "@/lib/format";
import { Modal, Field, Alert, Empty } from "@/components/ui";
import { toast, confirmDialog } from "@/components/feedback";

type I = { id: string; customerId: string | null; customerName: string; origin: string | null; destination: string; month: string | null; priority: string; status: string; programs: string[]; notes: string | null; offerSentAt: string | null; updatedAt: string };

export const STATUS: Record<string, [string, string]> = {
  NEW: ["Novo", "bg-blue-500/15 text-blue-300"],
  SEARCHING: ["Buscando oferta", "bg-amber-500/15 text-amber-300"],
  OFFER_SENT: ["Oferta enviada", "bg-violet-500/15 text-violet-300"],
  BOOKED: ["Fechado", "bg-emerald-500/15 text-emerald-300"],
  LOST: ["Perdido", "bg-panel2 text-muted"],
};
const PRIORITY: Record<string, [string, string]> = { HIGH: ["Alta", "text-red-300"], MEDIUM: ["Média", "text-amber-300"], LOW: ["Baixa", "text-muted"] };
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const monthLabel = (m: string | null) => (m ? `${MONTHS[Number(m.slice(5, 7)) - 1]}/${m.slice(0, 4)}` : "Qualquer época");
const VIEWS = [["lista", "Lista"], ["mes", "Por mês"], ["destino", "Por destino"], ["status", "Por status"]] as const;

export function InterestsClient({ items, customers, programs, filters }: { items: I[]; customers: { id: string; name: string }[]; programs: string[]; filters: { status: string; priority: string } }) {
  const router = useRouter();
  const nav = useNav();
  const [view, setView] = useState<(typeof VIEWS)[number][0]>("lista");
  const [editing, setEditing] = useState<I | "new" | null>(null);
  const go = (patch: Record<string, string>) => {
    const u = new URLSearchParams({ ...(filters.status ? { status: filters.status } : {}), ...(filters.priority ? { prioridade: filters.priority } : {}), ...patch });
    for (const [k, v] of [...u]) if (!v) u.delete(k);
    nav(`/app/contatos/interesses?${u}`);
  };
  async function setStatus(i: I, status: string) {
    const r = await api(`/api/interests/${i.id}/status`, "POST", { status });
    if (!r.ok) return toast(r.erro, "error");
    toast(`Marcado como "${STATUS[status]![0]}"`);
    refreshSafe(router);
  }
  async function remove(i: I) {
    if (!(await confirmDialog({ title: "Excluir interesse?", body: `${i.customerName} · ${i.destination}`, confirmLabel: "Excluir", danger: true }))) return;
    const r = await api(`/api/interests/${i.id}`, "DELETE");
    if (!r.ok) return toast(r.erro, "error");
    toast("Interesse excluído");
    refreshSafe(router);
  }
  const groups: [string, I[]][] = view === "lista" ? [["", items]]
    : view === "mes" ? [...new Set(items.map((i) => i.month ?? ""))].sort((a, b) => (a || "9999").localeCompare(b || "9999")).map((m) => [monthLabel(m || null), items.filter((i) => (i.month ?? "") === m)])
    : view === "destino" ? [...new Set(items.map((i) => i.destination))].sort().map((d) => [d, items.filter((i) => i.destination === d)])
    : Object.keys(STATUS).map((s) => [STATUS[s]![0], items.filter((i) => i.status === s)] as [string, I[]]).filter(([, l]) => l.length);
  const card = (i: I) => (
    <li key={i.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 font-semibold">
          <MapPin className="h-4 w-4 text-muted" />{i.origin ? `${i.origin} → ` : ""}{i.destination}
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[i.status]?.[1] ?? ""}`}>{STATUS[i.status]?.[0] ?? i.status}</span>
        </p>
        <p className="text-sm text-muted">{i.customerName} · {monthLabel(i.month)} · prioridade <span className={PRIORITY[i.priority]?.[1]}>{PRIORITY[i.priority]?.[0]}</span>{i.programs.length ? ` · ${i.programs.join(", ")}` : ""}</p>
        {i.notes && <p className="truncate text-xs text-muted">{i.notes}</p>}
        {i.offerSentAt && <p className="text-xs text-violet-300">Oferta enviada em {fmtDate(i.offerSentAt)}</p>}
      </div>
      <select className="input h-8 w-auto py-0 text-xs" value={i.status} onChange={(e) => setStatus(i, e.target.value)} aria-label={`Situação do interesse de ${i.customerName} em ${i.destination}`}>
        {Object.entries(STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
      </select>
      {i.status !== "OFFER_SENT" && i.status !== "BOOKED" && <button className="btn-subtle h-8 w-8 px-0" onClick={() => setStatus(i, "OFFER_SENT")} aria-label={`Marcar oferta enviada para ${i.customerName}`} title="Marcar oferta enviada"><Send className="h-4 w-4" /></button>}
      <button className="btn-subtle h-8 w-8 px-0" onClick={() => setEditing(i)} aria-label={`Editar interesse de ${i.customerName}`}><Pencil className="h-4 w-4" /></button>
      <button className="btn-subtle h-8 w-8 px-0" onClick={() => remove(i)} aria-label={`Excluir interesse de ${i.customerName}`}><Trash2 className="h-4 w-4" /></button>
    </li>
  );
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex gap-1 rounded-xl border border-line bg-panel p-1" role="group" aria-label="Visão">
          {VIEWS.map(([k, l]) => <button key={k} type="button" aria-pressed={view === k} onClick={() => setView(k)} className={`rounded-lg px-2.5 py-1 text-xs font-medium ${view === k ? "bg-panel2 text-white shadow-sm" : "text-muted hover:text-zinc-100"}`}>{l}</button>)}
        </div>
        <select className="input h-9 w-auto" value={filters.status} onChange={(e) => go({ status: e.target.value })} aria-label="Filtrar por situação"><option value="">Qualquer situação</option>{Object.entries(STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>
        <select className="input h-9 w-auto" value={filters.priority} onChange={(e) => go({ prioridade: e.target.value })} aria-label="Filtrar por prioridade"><option value="">Qualquer prioridade</option>{Object.entries(PRIORITY).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>
        <span className="flex-1" />
        <button className="btn-primary" onClick={() => setEditing("new")}><Plus className="h-4 w-4" />Novo interesse</button>
      </div>
      {items.length === 0 ? (
        <Empty title="Nenhum interesse encontrado" icon={<MapPin className="h-5 w-5" />}>
          <p className="max-w-sm text-sm text-muted">Anote para onde cada cliente quer viajar e quando. Assim que aparecer uma promoção, você sabe para quem mandar.</p>
        </Empty>
      ) : (
        <div className="space-y-4">
          {groups.map(([title, list]) => (
            <section key={title || "lista"} className="card overflow-hidden" aria-label={title || "Interesses"}>
              {title && <h2 className="border-b border-line px-5 py-2.5 text-sm font-semibold">{title} <span className="text-muted">({list.length})</span></h2>}
              <ul className="divide-y divide-line">{list.map(card)}</ul>
            </section>
          ))}
        </div>
      )}
      {editing && <InterestDialog i={editing === "new" ? null : editing} customers={customers} programs={programs} onClose={() => setEditing(null)} />}
    </>
  );
}

function InterestDialog({ i, customers, programs, onClose }: { i: I | null; customers: { id: string; name: string }[]; programs: string[]; onClose: () => void }) {
  const router = useRouter();
  const [f, setF] = useState({ customerId: i?.customerId ?? "", customerName: i?.customerId ? "" : i?.customerName ?? "", origin: i?.origin ?? "", destination: i?.destination ?? "", month: i?.month ?? "", priority: i?.priority ?? "MEDIUM", status: i?.status ?? "NEW", programs: i?.programs ?? [], notes: i?.notes ?? "" });
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const body = { ...f, customerId: f.customerId || null, origin: f.origin || null, month: f.month || null, notes: f.notes || null };
    const r = i ? await api(`/api/interests/${i.id}`, "PUT", body) : await api("/api/interests", "POST", body);
    setBusy(false);
    if (!r.ok) return setErro(r.erro);
    toast(i ? "Interesse atualizado" : "Interesse registrado");
    onClose();
    refreshSafe(router);
  }
  const toggle = (p: string) => setF({ ...f, programs: f.programs.includes(p) ? f.programs.filter((x) => x !== p) : [...f.programs, p] });
  return (
    <Modal open onClose={onClose} title={i ? "Editar interesse" : "Novo interesse de viagem"}
      footer={<><button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button form="int-form" className="btn-primary" disabled={busy}>Salvar</button></>}>
      <form id="int-form" onSubmit={save} className="grid gap-3 sm:grid-cols-2">
        {erro && <div className="sm:col-span-2"><Alert>{erro}</Alert></div>}
        <Field label="Cliente cadastrado">
          <select className="input" value={f.customerId} onChange={(e) => setF({ ...f, customerId: e.target.value })} aria-label="Cliente cadastrado"><option value="">Outro (digite o nome)</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </Field>
        {!f.customerId && <Field label="Nome do cliente" required><input className="input" value={f.customerName} onChange={(e) => setF({ ...f, customerName: e.target.value })} maxLength={120} aria-label="Nome do cliente" /></Field>}
        <Field label="Origem"><input className="input uppercase" value={f.origin} onChange={(e) => setF({ ...f, origin: e.target.value.toUpperCase().slice(0, 3) })} placeholder="GRU" aria-label="Origem" /></Field>
        <Field label="Destino" required><input className="input" value={f.destination} onChange={(e) => setF({ ...f, destination: e.target.value })} maxLength={80} placeholder="Lisboa, LIS, Europa..." required aria-label="Destino" /></Field>
        <Field label="Quando" hint="Vazio = qualquer época"><input className="input" type="month" value={f.month} onChange={(e) => setF({ ...f, month: e.target.value })} aria-label="Mês da viagem" /></Field>
        <Field label="Prioridade"><select className="input" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })} aria-label="Prioridade">{Object.entries(PRIORITY).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Situação"><select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} aria-label="Situação">{Object.entries(STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Programas de interesse" className="sm:col-span-2">
          <div className="flex flex-wrap gap-1">{programs.map((p) => <button key={p} type="button" aria-pressed={f.programs.includes(p)} onClick={() => toggle(p)} className={`rounded-full border px-2.5 py-0.5 text-xs ${f.programs.includes(p) ? "border-accent-light bg-accent-soft text-white" : "border-line text-muted"}`}>{p}</button>)}</div>
        </Field>
        <Field label="Observações" className="sm:col-span-2"><textarea className="input min-h-16" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} maxLength={1000} placeholder="Ex.: lua de mel, 2 adultos, prefere executiva" /></Field>
      </form>
    </Modal>
  );
}
