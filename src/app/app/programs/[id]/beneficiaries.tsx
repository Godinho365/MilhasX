"use client";
import { useEffect, useMemo, useState } from "react";
import { Link2, Pencil, Trash2, UserCheck, Users, Search, Filter, CalendarDays, Upload, Plus, Info, RefreshCw } from "lucide-react";
import { api, today } from "@/lib/api";
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
/** Abre a Gestão de CPFs da conta (botão "Gerir CPFs" da barra da conta). */
export const openCpfManager = () => window.dispatchEvent(new Event("mm:cpfs"));

/** card=false: só as janelas (Gestão de CPFs e editar limite), abertas pelo botão "Gerir CPFs" da barra. */
export function BeneficiaryLimit({ accountId, title, card = true }: { accountId: string; title: string; card?: boolean }) {
  const [s, setS] = useState<State | null>(null);
  const [dlg, setDlg] = useState<"history" | "edit" | null>(null);
  useEffect(() => {
    const open = () => setDlg("history");
    window.addEventListener("mm:cpfs", open);
    return () => window.removeEventListener("mm:cpfs", open);
  }, []);
  const load = async () => {
    const r = await api<{ item: State }>(`/api/accounts/${accountId}/beneficiaries`);
    if (r.ok) setS(r.data.item);
  };
  useEffect(() => {
    load();
  }, [accountId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!s) return null;
  const dialogs = (
    <>
      {dlg === "history" && <CpfManager accountId={accountId} title={title} s={s} onClose={() => setDlg(null)} onChange={load} onEditLimit={() => setDlg("edit")} />}
      {dlg === "edit" && <EditDialog accountId={accountId} s={s} onClose={() => setDlg("history")} onSaved={() => { setDlg("history"); load(); }} />}
    </>
  );
  if (!card) return dialogs;
  const pct = s.limit ? Math.min(100, Math.round((s.used / s.limit) * 100)) : 0;
  const full = s.limit != null && s.used >= s.limit;
  return (
    <section className="card card-pad" aria-label="Limite de beneficiários">
      <div className="flex items-center gap-2">
        <UserCheck className="h-4 w-4 text-muted" />
        <h2 className="flex-1 text-sm font-semibold">Limite de beneficiários</h2>
        <button type="button" className="btn-ghost h-8 border border-line px-2.5 text-xs" onClick={() => setDlg("history")}><Users className="h-3.5 w-3.5" />Gerir CPFs</button>
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
      {dialogs}
    </section>
  );
}

type Item = State["items"][number];
type Status = "uso" | "liberado" | "pendente";
const statusOf = (b: Item): Status => (!b.inWindow ? "liberado" : b.document ? "uso" : "pendente");
const STATUS_LABEL: Record<Status, [string, string]> = { uso: ["Em uso", "bg-emerald-500/15 text-emerald-300"], pendente: ["Sem CPF", "bg-amber-500/15 text-amber-300"], liberado: ["Liberado", "bg-panel2 text-muted"] };

function CpfManager({ accountId, title, s, onClose, onChange, onEditLimit }: { accountId: string; title: string; s: State; onClose: () => void; onChange: () => void; onEditLimit: () => void }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"" | Status>("");
  const [panel, setPanel] = useState<"add" | "import" | "simulate" | null>(null);
  const others = s.items.filter((b) => !b.isHolder);
  const now = Date.now();
  const soon = others.filter((b) => b.inWindow && Date.parse(b.expiresAt) - now <= 30 * 86_400_000);
  const pending = others.filter((b) => b.inWindow && !b.document);
  const free = s.limit != null ? Math.max(0, s.limit - s.used) : null;
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const digits = term.replace(/\D/g, "");
    return others.filter((b) => (!filter || statusOf(b) === filter) && (!term || b.name.toLowerCase().includes(term) || (!!digits && (b.document ?? "").includes(digits))));
  }, [others, q, filter]);
  async function remove(id: string, n: string) {
    if (!(await confirmDialog({ title: `Tirar ${n} da lista?`, confirmLabel: "Tirar", danger: true }))) return;
    const r = await api(`/api/accounts/${accountId}/beneficiaries/${id}`, "DELETE");
    if (!r.ok) return toast(r.erro, "error");
    onChange();
  }
  const stat = (label: string, value: string | number, sub: string, tone = "") => (
    <div className="rounded-xl border border-line bg-panel px-4 py-3">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={`text-2xl font-semibold tabular-nums ${tone}`}>{value}</p>
      <p className="text-[11px] text-muted">{sub}</p>
    </div>
  );
  const toggle = (p: "add" | "import" | "simulate") => setPanel(panel === p ? null : p);
  return (
    <Modal open onClose={onClose} title={`Gestão de CPFs - ${title}`} icon={<Users className="h-5 w-5" />} size="lg">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {stat("Total", s.limit ?? "-", s.limit != null ? "CPFs no limite" : "sem limite definido")}
        {stat("Em uso", s.used, "inclui o titular", "text-emerald-300")}
        {stat("Disponíveis", free ?? "-", "CPFs livres")}
        {stat("Liberam em 30 dias", soon.length, soon.length ? `próximo em ${fmtDate(soon.map((b) => b.expiresAt).sort()[0]!)}` : "nenhum vencendo", "text-emerald-300")}
        {stat("Pendentes", pending.length, pending.length ? "sem CPF informado" : "todos informados", pending.length ? "text-amber-300" : "")}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-panel px-4 py-3">
        <RefreshCw className="h-4 w-4 shrink-0 text-muted" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Recuperação automática</p>
          <p className="text-xs text-muted">{s.window === "CALENDAR_YEAR" ? "Os CPFs voltam a ficar livres na virada do ano." : "Cada CPF volta a ficar livre 12 meses depois da emissão."} Limite: {s.limit ?? "não definido"}{s.suggested ? " (sugestão do programa)" : ""}.</p>
        </div>
        <button type="button" className="btn-ghost h-8 border border-line px-2.5 text-xs" onClick={onEditLimit}><Pencil className="h-3.5 w-3.5" />Editar limite</button>
      </div>

      <p className="mt-3 flex items-center gap-2 rounded-xl border border-line bg-panel px-4 py-2.5 text-xs text-muted"><Info className="h-3.5 w-3.5 shrink-0" />Os CPFs entram sozinhos quando você registra uma venda com os clientes da emissão; aqui você completa e corrige a lista.</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input h-9 pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome ou CPF..." aria-label="Buscar CPF" />
        </label>
        <label className="relative">
          <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <select className="input h-9 w-auto pl-9" value={filter} onChange={(e) => setFilter(e.target.value as "" | Status)} aria-label="Filtrar CPFs">
            <option value="">Todos</option><option value="uso">Em uso</option><option value="pendente">Sem CPF</option><option value="liberado">Liberados</option>
          </select>
        </label>
        <button type="button" aria-pressed={panel === "simulate"} className="btn-ghost h-9 border border-line" onClick={() => toggle("simulate")}><CalendarDays className="h-4 w-4" />Simular</button>
        <button type="button" aria-pressed={panel === "import"} className="btn-ghost h-9 border border-line" onClick={() => toggle("import")}><Upload className="h-4 w-4" />Importar</button>
        <button type="button" aria-pressed={panel === "add"} className="btn-primary h-9" onClick={() => toggle("add")}><Plus className="h-4 w-4" />Adicionar CPF</button>
      </div>

      {panel === "add" && <AddCpf accountId={accountId} onAdded={onChange} />}
      {panel === "import" && <ImportCpfs accountId={accountId} onDone={() => { onChange(); setPanel(null); }} />}
      {panel === "simulate" && <SimulateCpfs s={s} />}

      {others.length === 0 ? (
        <div className="py-10 text-center">
          <Users className="mx-auto h-10 w-10 text-muted" />
          <p className="mt-2 font-medium">Nenhum CPF em uso ainda</p>
          <p className="text-sm text-muted">Entram sozinhos ao registrar vendas desta conta, ou adicione acima.</p>
        </div>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-xl border border-line">
          <table className="table-base">
            <thead><tr><th>Nome</th><th>CPF</th><th>Emissão</th><th>Libera em</th><th>Situação</th><th /></tr></thead>
            <tbody>
              <tr className="bg-accent-soft/20">
                <td className="font-medium"><span className="flex items-center gap-2">{s.holder.name}<span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-light">Titular</span></span></td>
                <td className="tabular-nums text-muted">{cpfMask(s.holder.document) || "-"}</td><td className="text-muted">-</td><td className="text-muted">vaga fixa</td>
                <td><span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300">Em uso</span></td><td><Link2 className="h-4 w-4 text-muted" aria-hidden /></td>
              </tr>
              {rows.map((b) => {
                const st = statusOf(b);
                const left = Math.ceil((Date.parse(b.expiresAt) - now) / 86_400_000);
                return (
                  <tr key={b.id} className={st === "liberado" ? "opacity-60" : ""}>
                    <td className="font-medium">{b.name}{b.fromSale && <span className="ml-1.5 text-[11px] font-normal text-muted">· venda</span>}</td>
                    <td className="tabular-nums">{cpfMask(b.document) || <span className="text-amber-300">não informado</span>}</td>
                    <td className="whitespace-nowrap tabular-nums">{fmtDate(b.usedAt)}</td>
                    <td className="whitespace-nowrap tabular-nums">{b.inWindow ? <>{fmtDate(b.expiresAt)} <span className={`text-xs ${left <= 30 ? "text-emerald-300" : "text-muted"}`}>({left} d)</span></> : "-"}</td>
                    <td><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${STATUS_LABEL[st][1]}`}>{STATUS_LABEL[st][0]}</span></td>
                    <td>{!b.fromSale && <button type="button" className="btn-subtle h-7 w-7 px-0" onClick={() => remove(b.id, b.name)} aria-label={`Tirar ${b.name}`}><Trash2 className="h-3.5 w-3.5" /></button>}</td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-sm text-muted">Nenhum CPF com esse filtro.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted"><Info className="h-3.5 w-3.5" />Contam os CPFs emitidos desde {fmtDate(s.since)}. O titular ocupa 1 vaga fixa.</p>
    </Modal>
  );
}

function AddCpf({ accountId, onAdded }: { accountId: string; onAdded: () => void }) {
  const [name, setName] = useState("");
  const [doc, setDoc] = useState("");
  const [date, setDate] = useState(today());
  const [erro, setErro] = useState("");
  async function add(e: React.FormEvent) {
    e.preventDefault();
    const r = await api(`/api/accounts/${accountId}/beneficiaries`, "POST", { name, document: doc || null, usedAt: date });
    if (!r.ok) return setErro(r.erro);
    setErro(""); setName(""); setDoc("");
    toast("CPF adicionado");
    onAdded();
  }
  return (
    <form onSubmit={add} className="mt-3 grid gap-3 rounded-xl border border-line bg-panel p-3 sm:grid-cols-[1fr_10rem_9rem_auto] sm:items-end" aria-label="Adicionar CPF">
      {erro && <div className="sm:col-span-4"><Alert>{erro}</Alert></div>}
      <Field label="Nome"><input className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} autoFocus /></Field>
      <Field label="CPF"><input className="input" value={doc} onChange={(e) => setDoc(e.target.value)} inputMode="numeric" maxLength={14} placeholder="000.000.000-00" /></Field>
      <Field label="Data da emissão"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
      <button className="btn-primary h-10">Adicionar</button>
    </form>
  );
}

/** Uma linha por pessoa: Nome; CPF; data (AAAA-MM-DD ou DD/MM/AAAA). CPF e data são opcionais. */
function ImportCpfs({ accountId, onDone }: { accountId: string; onDone: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const parse = (l: string) => {
    const [name = "", doc = "", d = ""] = l.split(/[;\t]/).map((x) => x.trim());
    const br = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const date = br ? `${br[3]}-${br[2]}-${br[1]}` : /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : today();
    return { name, document: doc.replace(/\D/g, "") || null, usedAt: date };
  };
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map(parse).filter((l) => l.name);
  async function run() {
    setBusy(true);
    let ok = 0;
    for (const l of lines) {
      const r = await api(`/api/accounts/${accountId}/beneficiaries`, "POST", l);
      if (!r.ok) { setBusy(false); return setErro(`${l.name}: ${r.erro} (${ok} importados antes)`); }
      ok++;
    }
    setBusy(false);
    toast(`${ok} CPFs importados`);
    onDone();
  }
  return (
    <div className="mt-3 space-y-2 rounded-xl border border-line bg-panel p-3">
      {erro && <Alert>{erro}</Alert>}
      <Field label="Cole uma pessoa por linha: Nome; CPF; data da emissão" hint="Pode colar de uma planilha (colunas separadas por tab). Sem data, vale hoje.">
        <textarea className="input min-h-[96px] font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} placeholder={"Maria Souza; 123.456.789-09; 15/03/2026\nJoão Lima; 98765432100; 2026-05-02"} />
      </Field>
      <div className="flex items-center gap-2"><span className="flex-1 text-xs text-muted">{lines.length} {lines.length === 1 ? "pessoa" : "pessoas"} para importar</span><button type="button" className="btn-primary h-9" disabled={!lines.length || busy} onClick={run}>Importar</button></div>
    </div>
  );
}

/** Quantos CPFs estarão livres numa data: os de hoje mais os que vencem até lá. */
function SimulateCpfs({ s }: { s: State }) {
  const [date, setDate] = useState(today());
  const at = Date.parse(`${date}T00:00:00Z`);
  const freed = s.items.filter((b) => !b.isHolder && b.inWindow && Date.parse(b.expiresAt) <= at).length;
  const used = Math.max(1, s.used - freed);
  return (
    <div className="mt-3 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-panel p-3">
      <Field label="Simular a data"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <p className="pb-2 text-sm">Em {fmtDate(date)}: <b className="tabular-nums">{used}</b> em uso{s.limit != null && <> · <b className="tabular-nums text-emerald-300">{Math.max(0, s.limit - used)}</b> livres</>}{freed > 0 && <span className="text-muted"> ({freed} liberados até lá)</span>}</p>
    </div>
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
