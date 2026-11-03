"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Search, Cake, Download, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useNav, refreshSafe } from "@/lib/nav";
import { fmtDate } from "@/lib/format";
import { Modal, Field, Alert, Empty } from "@/components/ui";
import { Stat } from "@/components/stat";
import { toast, confirmDialog } from "@/components/feedback";

type P = { id: string; name: string; cpf: string | null; birthDate: string | null; email: string | null; phone: string | null; notes: string | null; customerId: string | null; customer: string | null; lastUse: { date: string; account: string } | null; birthdayMonth: boolean; birthdaySoon: boolean };
type Totals = { total: number; recent: number; withCpf: number; birthdayMonth: number; birthdaySoon: number };
const fmtCpf = (c: string | null) => (c && c.length === 11 ? `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}` : c ?? "-");

export function PassengersClient({ items, totals, customers, q, filter }: { items: P[]; totals: Totals; customers: { id: string; name: string }[]; q: string; filter: string }) {
  const router = useRouter();
  const nav = useNav();
  const [editing, setEditing] = useState<P | "new" | null>(null);
  async function importUsed() {
    const r = await api<{ created: number }>("/api/passengers/import", "POST");
    if (!r.ok) return toast(r.erro, "error");
    toast(r.data.created ? `${r.data.created} passageiros trazidos das contas` : "Nenhum passageiro novo nas contas");
    refreshSafe(router);
  }
  async function remove(p: P) {
    if (!(await confirmDialog({ title: "Excluir passageiro?", body: p.name, confirmLabel: "Excluir", danger: true }))) return;
    const r = await api(`/api/passengers/${p.id}`, "DELETE");
    if (!r.ok) return toast(r.erro, "error");
    toast("Passageiro excluído");
    refreshSafe(router);
  }
  const go = (patch: Record<string, string>) => nav(`/app/contatos/passageiros?${new URLSearchParams({ ...(q ? { q } : {}), filtro: filter, ...patch })}`);
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Passageiros" value={String(totals.total)} />
        <Stat label="Novos" value={String(totals.recent)} hint="últimos 30 dias" />
        <Stat label="Com CPF" value={String(totals.withCpf)} />
        <Stat label="Aniversariantes" value={String(totals.birthdayMonth)} hint="no mês" />
        <Stat label="Próximos 7 dias" value={String(totals.birthdaySoon)} hint="aniversários" accent={totals.birthdaySoon > 0} />
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <form className="relative min-w-[220px] flex-1 sm:max-w-sm" onSubmit={(e) => { e.preventDefault(); go({ q: String(new FormData(e.currentTarget).get("q") || "") }); }}>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input pl-9" name="q" defaultValue={q} placeholder="Buscar por nome ou CPF" aria-label="Buscar passageiros" />
        </form>
        <div className="inline-flex gap-1 rounded-xl border border-line bg-panel p-1" role="group" aria-label="Filtro">
          {[["todos", "Todos"], ["aniversario", "Aniversariantes do mês"], ["semana", "Próximos 7 dias"]].map(([k, l]) => (
            <button key={k} type="button" aria-pressed={filter === k} onClick={() => go({ filtro: k! })} className={`rounded-lg px-2.5 py-1 text-xs font-medium ${filter === k ? "bg-panel2 text-white shadow-sm" : "text-muted hover:text-zinc-100"}`}>{l}</button>
          ))}
        </div>
        <span className="flex-1" />
        <button className="btn-ghost" onClick={importUsed} title="Cria os passageiros dos CPFs já emitidos nas suas contas"><Download className="h-4 w-4" />Trazer das contas</button>
        <button className="btn-primary" onClick={() => setEditing("new")}><Plus className="h-4 w-4" />Novo passageiro</button>
      </div>
      {items.length === 0 ? (
        <Empty title="Nenhum passageiro" icon={<Users className="h-5 w-5" />}>
          <p className="max-w-sm text-sm text-muted">Cadastre os passageiros ou traga de uma vez os CPFs que você já emitiu nas contas.</p>
        </Empty>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead><tr><th>Nome</th><th>CPF</th><th>Nascimento</th><th>Cliente vinculado</th><th>Última conta usada</th><th className="w-20 text-right">Ações</th></tr></thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id}>
                    <td className="font-medium">{p.name}{(p.email || p.phone) && <span className="block text-xs text-muted">{[p.phone, p.email].filter(Boolean).join(" · ")}</span>}</td>
                    <td className="whitespace-nowrap font-mono text-xs">{fmtCpf(p.cpf)}</td>
                    <td className="whitespace-nowrap tabular-nums">{p.birthDate ? fmtDate(p.birthDate) : "-"}{p.birthdaySoon ? <span className="ml-1 inline-flex items-center gap-0.5 text-xs text-amber-300"><Cake className="h-3 w-3" />em breve</span> : p.birthdayMonth ? <Cake className="ml-1 inline h-3 w-3 text-muted" aria-label="Aniversaria este mês" /> : null}</td>
                    <td>{p.customer ?? "-"}</td>
                    <td className="text-sm">{p.lastUse ? <>{p.lastUse.account}<span className="block text-xs text-muted">{fmtDate(p.lastUse.date)}</span></> : "-"}</td>
                    <td className="text-right">
                      <div className="inline-flex gap-1">
                        <button className="btn-subtle h-8 w-8 px-0" onClick={() => setEditing(p)} aria-label={`Editar ${p.name}`}><Pencil className="h-4 w-4" /></button>
                        <button className="btn-subtle h-8 w-8 px-0" onClick={() => remove(p)} aria-label={`Excluir ${p.name}`}><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {editing && <PassengerDialog p={editing === "new" ? null : editing} customers={customers} onClose={() => setEditing(null)} />}
    </>
  );
}

function PassengerDialog({ p, customers, onClose }: { p: P | null; customers: { id: string; name: string }[]; onClose: () => void }) {
  const router = useRouter();
  const [f, setF] = useState({ name: p?.name ?? "", cpf: p?.cpf ? fmtCpf(p.cpf) : "", birthDate: p?.birthDate ?? "", email: p?.email ?? "", phone: p?.phone ?? "", customerId: p?.customerId ?? "", notes: p?.notes ?? "" });
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const body = { ...f, cpf: f.cpf || null, birthDate: f.birthDate || null, email: f.email || null, phone: f.phone || null, customerId: f.customerId || null, notes: f.notes || null };
    const r = p ? await api(`/api/passengers/${p.id}`, "PUT", body) : await api("/api/passengers", "POST", body);
    setBusy(false);
    if (!r.ok) return setErro(r.erro);
    toast(p ? "Passageiro atualizado" : "Passageiro cadastrado");
    onClose();
    refreshSafe(router);
  }
  return (
    <Modal open onClose={onClose} title={p ? "Editar passageiro" : "Novo passageiro"}
      footer={<><button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button form="pax-form" className="btn-primary" disabled={busy}>Salvar</button></>}>
      <form id="pax-form" onSubmit={save} className="grid gap-3 sm:grid-cols-2">
        {erro && <div className="sm:col-span-2"><Alert>{erro}</Alert></div>}
        <Field label="Nome completo" required className="sm:col-span-2"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={120} required aria-label="Nome completo" autoFocus /></Field>
        <Field label="CPF"><input className="input" inputMode="numeric" value={f.cpf} onChange={(e) => setF({ ...f, cpf: e.target.value })} placeholder="000.000.000-00" aria-label="CPF" /></Field>
        <Field label="Data de nascimento"><input className="input" type="date" value={f.birthDate} onChange={(e) => setF({ ...f, birthDate: e.target.value })} aria-label="Data de nascimento" /></Field>
        <Field label="Telefone"><input className="input" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} maxLength={30} aria-label="Telefone" /></Field>
        <Field label="E-mail"><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} maxLength={200} aria-label="E-mail" /></Field>
        <Field label="Cliente vinculado" className="sm:col-span-2">
          <select className="input" value={f.customerId} onChange={(e) => setF({ ...f, customerId: e.target.value })} aria-label="Cliente vinculado"><option value="">Nenhum</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </Field>
        <Field label="Observações" className="sm:col-span-2"><textarea className="input min-h-16" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} maxLength={1000} /></Field>
      </form>
    </Modal>
  );
}
