"use client";
import { useEffect, useState } from "react";
import { History, Link2, Pencil, Trash2, UserCheck } from "lucide-react";
import { api } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { Modal, Field, Alert } from "@/components/ui";
import { toast, confirmDialog } from "@/components/feedback";
import { WINDOW_LABELS, type BeneficiaryWindow } from "@/domain/beneficiaries";

type State = {
  limit: number | null; window: BeneficiaryWindow; suggested: boolean; used: number; since: string;
  holder: { name: string; document: string | null };
  items: { id: string; name: string; document: string | null; usedAt: string; fromSale: boolean; inWindow: boolean; expiresAt: string; isHolder: boolean }[];
};

const cpfMask = (d: string | null) => (d && d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : d ?? "");

/** "Limite de beneficiários": CPFs distintos usados na janela do programa, com histórico e edição. */
export function BeneficiaryLimit({ accountId }: { accountId: string }) {
  const [s, setS] = useState<State | null>(null);
  const [dlg, setDlg] = useState<"history" | "edit" | null>(null);
  const load = async () => {
    const r = await api<{ item: State }>(`/api/accounts/${accountId}/beneficiaries`);
    if (r.ok) setS(r.data.item);
  };
  useEffect(() => {
    load();
  }, [accountId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!s) return null;
  const pct = s.limit ? Math.min(100, Math.round((s.used / s.limit) * 100)) : 0;
  const full = s.limit != null && s.used >= s.limit;
  return (
    <section className="card card-pad" aria-label="Limite de beneficiários">
      <div className="flex items-center gap-2">
        <UserCheck className="h-4 w-4 text-muted" />
        <h2 className="flex-1 text-sm font-semibold">Limite de beneficiários</h2>
        <button type="button" className="btn-subtle h-8 w-8 px-0" onClick={() => setDlg("history")} aria-label="Histórico de beneficiários" title="Histórico"><History className="h-4 w-4" /></button>
        <button type="button" className="btn-subtle h-8 w-8 px-0" onClick={() => setDlg("edit")} aria-label="Editar limite de beneficiários" title="Editar limite"><Pencil className="h-4 w-4" /></button>
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <p className="tabular-nums"><span className="text-2xl font-semibold">{s.used}{s.limit != null && ` / ${s.limit}`}</span> <span className="text-sm text-muted">CPFs</span></p>
        <p className="text-xs text-muted">{s.limit != null ? WINDOW_LABELS[s.window] : "Sem limite definido"}{s.suggested && " · sugestão do programa"}</p>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-panel2" role="progressbar" aria-valuemin={0} aria-valuemax={s.limit ?? 0} aria-valuenow={s.used} aria-label="CPFs usados">
        <div className={`h-full rounded-full ${full ? "bg-red-400" : pct >= 80 ? "bg-amber-400" : "bg-accent-light"}`} style={{ width: `${s.limit ? pct : 0}%` }} />
      </div>
      {full && <p className="mt-2 text-xs font-medium text-red-300">Limite atingido: novas emissões só para quem já está na lista.</p>}
      {(() => {
        const next = s.items.filter((b) => b.inWindow && !b.isHolder).map((b) => b.expiresAt).sort()[0];
        return (
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span className="flex items-center gap-1"><Link2 className="h-3.5 w-3.5" />{s.holder.name} (titular) ocupa 1 vaga fixa</span>
            {next && <span>· Próxima vaga libera em {fmtDate(next)}</span>}
          </p>
        );
      })()}
      {dlg === "history" && <HistoryDialog accountId={accountId} s={s} onClose={() => setDlg(null)} onChange={load} />}
      {dlg === "edit" && <EditDialog accountId={accountId} s={s} onClose={() => setDlg(null)} onSaved={() => { setDlg(null); load(); }} />}
    </section>
  );
}

function HistoryDialog({ accountId, s, onClose, onChange }: { accountId: string; s: State; onClose: () => void; onChange: () => void }) {
  const [name, setName] = useState("");
  const [doc, setDoc] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [erro, setErro] = useState("");
  async function add(e: React.FormEvent) {
    e.preventDefault();
    const r = await api(`/api/accounts/${accountId}/beneficiaries`, "POST", { name, document: doc || null, usedAt: date });
    if (!r.ok) return setErro(r.erro);
    setErro(""); setName(""); setDoc("");
    toast("Beneficiário adicionado");
    onChange();
  }
  async function remove(id: string, n: string) {
    if (!(await confirmDialog({ title: `Tirar ${n} da lista?`, confirmLabel: "Tirar", danger: true }))) return;
    const r = await api(`/api/accounts/${accountId}/beneficiaries/${id}`, "DELETE");
    if (!r.ok) return toast(r.erro, "error");
    onChange();
  }
  return (
    <Modal open onClose={onClose} title="Beneficiários da conta" size="lg">
      <p className="mb-3 text-sm text-muted">Quem já recebeu emissões com os pontos desta conta. Vem das vendas (clientes do item) e do que você informar aqui. Contam os CPFs desde {fmtDate(s.since)}; cada CPF libera a vaga {s.window === "CALENDAR_YEAR" ? "na virada do ano" : "12 meses depois da emissão"}.</p>
      <ul className="divide-y divide-line rounded-xl border border-line text-sm" aria-label="Beneficiários">
        <li className="flex items-center gap-3 bg-accent-soft/30 px-3 py-2">
          <span className="min-w-0 flex-1"><span className="flex items-center gap-2 font-medium"><span className="truncate">{s.holder.name}</span><span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-light">Titular</span></span><span className="text-xs text-muted">{cpfMask(s.holder.document) || "CPF no cadastro do titular"} · vinculado à conta, ocupa 1 vaga fixa</span></span>
          <Link2 className="h-4 w-4 text-muted" aria-hidden />
        </li>
        {s.items.filter((b) => !b.isHolder).map((b) => {
          const left = Math.ceil((Date.parse(b.expiresAt) - Date.now()) / 86_400_000);
          return (
            <li key={b.id} className={`flex items-center gap-3 px-3 py-2 ${b.inWindow ? "" : "opacity-50"}`}>
              <span className="min-w-0 flex-1"><span className="block truncate font-medium">{b.name}</span><span className="text-xs text-muted">{cpfMask(b.document) || "sem CPF"} · emitido {fmtDate(b.usedAt)}{b.fromSale ? " · venda" : ""}</span></span>
              <span className={`whitespace-nowrap text-right text-xs ${!b.inWindow ? "text-muted" : left <= 30 ? "text-green-300" : "text-muted"}`}>{b.inWindow ? <>Vence {fmtDate(b.expiresAt)}<span className="block text-[11px]">{left} dia{left === 1 ? "" : "s"}</span></> : "Liberado"}</span>
              {!b.fromSale && <button type="button" className="btn-subtle h-7 w-7 px-0" onClick={() => remove(b.id, b.name)} aria-label={`Tirar ${b.name}`}><Trash2 className="h-3.5 w-3.5" /></button>}
            </li>
          );
        })}
      </ul>
      <form onSubmit={add} className="mt-4 grid gap-3 sm:grid-cols-[1fr_10rem_9rem_auto] sm:items-end" aria-label="Adicionar beneficiário">
        {erro && <div className="sm:col-span-4"><Alert>{erro}</Alert></div>}
        <Field label="Nome"><input className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} /></Field>
        <Field label="CPF"><input className="input" value={doc} onChange={(e) => setDoc(e.target.value)} inputMode="numeric" maxLength={14} placeholder="000.000.000-00" /></Field>
        <Field label="Data da emissão"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
        <button className="btn-primary h-10">Adicionar</button>
      </form>
    </Modal>
  );
}

function EditDialog({ accountId, s, onClose, onSaved }: { accountId: string; s: State; onClose: () => void; onSaved: () => void }) {
  const [limit, setLimit] = useState(s.limit != null ? String(s.limit) : "");
  const [win, setWin] = useState<BeneficiaryWindow>(s.window);
  const [erro, setErro] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const r = await api(`/api/accounts/${accountId}/beneficiaries`, "PUT", { limit: limit.trim() ? Number(limit) : null, window: win });
    if (!r.ok) return setErro(r.erro);
    toast("Limite atualizado");
    onSaved();
  }
  return (
    <Modal open onClose={onClose} title="Limite de beneficiários" size="sm" footer={<><button className="btn-ghost" onClick={onClose}>Cancelar</button><button form="benef-form" className="btn-primary">Salvar</button></>}>
      <form id="benef-form" onSubmit={save} className="space-y-4">
        {erro && <Alert>{erro}</Alert>}
        <Field label="CPFs permitidos" hint={s.suggested ? "Hoje vale a sugestão do programa; confira a regra atual e ajuste." : "Vazio: volta à sugestão do programa (se houver)."}><input className="input" type="number" min={1} max={1000} value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="25" /></Field>
        <Field label="Período">
          <select className="input" value={win} onChange={(e) => setWin(e.target.value as BeneficiaryWindow)}>
            {(Object.keys(WINDOW_LABELS) as BeneficiaryWindow[]).map((k) => <option key={k} value={k}>{WINDOW_LABELS[k]}</option>)}
          </select>
        </Field>
      </form>
    </Modal>
  );
}
