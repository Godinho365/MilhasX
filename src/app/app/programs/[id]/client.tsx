"use client";
import { useRouter } from "next/navigation";
import { refreshSafe } from "@/lib/nav";
import { useState } from "react";
import { CalendarClock, Plus, Bell, BellOff, MoreHorizontal, Trash2, Pause, Play, KeyRound, ShoppingBag, Eye, Copy, Pencil, Check } from "lucide-react";
import { api, today } from "@/lib/api";
import { fmtBRL, fmtDate, fmtPts, parseBRLToCents } from "@/lib/format";
import { MANUAL_CREDIT_TYPES, ENTRY_LABELS, type EntryType } from "@/domain/ledger";
import { Modal, Field, Alert } from "@/components/ui";
import { toast, confirmDialog } from "@/components/feedback";

const FREQ: Record<string, string> = { MONTHLY: "Mensal", QUARTERLY: "Trimestral", YEARLY: "Anual" };
const dm = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "numeric", month: "short", timeZone: "UTC" }).replace(".", "");

function Head({ icon, tone, title, sub, action }: { icon: React.ReactNode; tone: string; title: string; sub: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}>{icon}</span>
      <div className="min-w-0 flex-1">
        <h2 className="font-semibold">{title}</h2>
        <p className="text-sm text-muted">{sub}</p>
      </div>
      {action}
    </div>
  );
}

export function PendingPurchases({ items }: { items: { id: string; store: string; purchasedAt: string; amountCents: number; expectedPoints: number; expectedAt: string | null }[] }) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl bg-panel2/70 px-4 py-12 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-panel2 text-muted"><ShoppingBag className="h-5 w-5" /></span>
        <p className="text-sm text-zinc-300">Nenhuma compra pendente.</p>
        <p className="text-xs text-muted">Suas compras em andamento aparecerão aqui</p>
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {items.map((p) => (
        <li key={p.id} className="flex items-center gap-3 rounded-xl bg-panel2/70 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{p.store}</p>
            <p className="text-xs text-muted">{dm(p.purchasedAt)} · {fmtBRL(p.amountCents)}{p.expectedAt && ` · previsto ${dm(p.expectedAt)}`}</p>
          </div>
          <span className="text-sm font-semibold tabular-nums text-amber-300">+{fmtPts(p.expectedPoints)}</span>
        </li>
      ))}
    </ul>
  );
}

type Rec = { id: string; type: string; description: string; points: number; costCents: number; frequency: string; nextDate: string; notify: boolean; active: boolean };

export function Recurrences({ accountId, items }: { accountId: string; items: Rec[] }) {
  const router = useRouter();
  const [edit, setEdit] = useState<Rec | "new" | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const cur = edit && edit !== "new" ? edit : null;

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const cost = parseBRLToCents(String(f.get("cost") || "0"));
    if (cost === null) return setErro("Valor inválido");
    const body = {
      accountId, type: f.get("type"), description: f.get("description"), points: Number(String(f.get("points")).replace(/\D/g, "")),
      costCents: cost, frequency: f.get("frequency"), nextDate: f.get("nextDate"), notify: f.get("notify") === "on",
    };
    const r = cur ? await api(`/api/recurrences/${cur.id}`, "PUT", body) : await api("/api/recurrences", "POST", body);
    if (!r.ok) return setErro(r.erro);
    setErro("");
    setEdit(null);
    toast(cur ? "Recorrência atualizada" : "Recorrência criada");
    refreshSafe(router);
  }
  async function patch(r: Rec, data: { notify?: boolean; active?: boolean }, msg: string) {
    setMenu(null);
    const res = await api(`/api/recurrences/${r.id}`, "PATCH", data);
    if (!res.ok) return toast(res.erro, "error");
    toast(msg);
    refreshSafe(router);
  }
  async function remove(r: Rec) {
    setMenu(null);
    if (!(await confirmDialog({ title: "Excluir recorrência?", body: "Os lançamentos já gerados continuam no extrato.", confirmLabel: "Excluir", danger: true }))) return;
    const res = await api(`/api/recurrences/${r.id}`, "DELETE");
    if (!res.ok) return toast(res.erro, "error");
    toast("Recorrência excluída");
    refreshSafe(router);
  }

  return (
    <section className="card card-pad mt-4">
      <Head
        icon={<CalendarClock className="h-5 w-5" />}
        tone="bg-violet-500/15 text-violet-300"
        title="Lançamentos Recorrentes"
        sub="Gerencie assinatura de clubes"
        action={<button className="btn-subtle h-9 w-9 px-0" onClick={() => { setErro(""); setEdit("new"); }} aria-label="Adicionar recorrência"><Plus className="h-5 w-5" /></button>}
      />
      {items.length === 0 ? (
        <div className="rounded-xl bg-panel2/70 px-4 py-8 text-center text-sm text-muted">
          Nenhuma recorrência. Cadastre a assinatura do clube e os pontos entram sozinhos todo mês.
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((r) => (
            <li key={r.id} className={`flex items-center gap-3 rounded-xl bg-panel2/70 px-4 py-3 ${r.active ? "" : "opacity-60"}`}>
              <span className={`h-2 w-2 shrink-0 rounded-full ${r.active ? "bg-ok" : "bg-zinc-600"}`} title={r.active ? "Ativa" : "Pausada"} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  <span className="truncate">{r.description}</span>
                  <span className="rounded bg-panel px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">{FREQ[r.frequency]}</span>
                </p>
                <p className="text-xs text-muted">{r.active ? `Próxima: ${dm(r.nextDate)}` : "Pausada"}</p>
              </div>
              <span className="hidden text-sm tabular-nums text-muted sm:inline">{r.costCents ? fmtBRL(r.costCents) : ""}</span>
              <span className="text-sm font-semibold tabular-nums text-ok">+{fmtPts(r.points)}</span>
              <button className="btn-subtle h-8 w-8 px-0" onClick={() => patch(r, { notify: !r.notify }, r.notify ? "Avisos desligados" : "Avisos ligados")} aria-label={r.notify ? "Desligar avisos" : "Ligar avisos"} aria-pressed={r.notify}>
                {r.notify ? <Bell className="h-4 w-4 text-accent-light" /> : <BellOff className="h-4 w-4" />}
              </button>
              <div className="relative">
                <button className="btn-subtle h-8 w-8 px-0" onClick={() => setMenu(menu === r.id ? null : r.id)} aria-label={`Ações de ${r.description}`} aria-haspopup="menu" aria-expanded={menu === r.id}><MoreHorizontal className="h-4 w-4" /></button>
                {menu === r.id && (
                  <div role="menu" className="absolute right-0 top-full z-20 mt-1 w-44 animate-pop-in rounded-xl border border-line bg-panel2 p-1 shadow-xl shadow-black/40">
                    <button role="menuitem" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-line" onClick={() => { setMenu(null); setErro(""); setEdit(r); }}><Pencil className="h-4 w-4" />Editar</button>
                    <button role="menuitem" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-line" onClick={() => patch(r, { active: !r.active }, r.active ? "Recorrência pausada" : "Recorrência retomada")}>{r.active ? <><Pause className="h-4 w-4" />Pausar</> : <><Play className="h-4 w-4" />Retomar</>}</button>
                    <button role="menuitem" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-300 hover:bg-line" onClick={() => remove(r)}><Trash2 className="h-4 w-4" />Excluir</button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={cur ? "Editar recorrência" : "Nova recorrência"} footer={<><button className="btn-ghost" onClick={() => setEdit(null)}>Cancelar</button><button form="rec-form" className="btn-primary">Salvar</button></>}>
        <form id="rec-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2" key={cur?.id ?? "new"}>
          {erro && <div className="sm:col-span-2"><Alert>{erro}</Alert></div>}
          <Field label="Descrição" required className="sm:col-span-2"><input className="input" name="description" required maxLength={120} defaultValue={cur?.description ?? "Pontos de clube"} /></Field>
          <Field label="Categoria" required>
            <select className="input" name="type" defaultValue={cur?.type ?? "CLUB"}>{MANUAL_CREDIT_TYPES.map((t) => <option key={t} value={t}>{ENTRY_LABELS[t as EntryType]}</option>)}</select>
          </Field>
          <Field label="Frequência" required>
            <select className="input" name="frequency" defaultValue={cur?.frequency ?? "MONTHLY"}>{Object.entries(FREQ).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </Field>
          <Field label="Pontos por ciclo" required><input className="input" name="points" inputMode="numeric" required defaultValue={cur ? fmtPts(cur.points) : ""} placeholder="2.000" /></Field>
          <Field label="Valor por ciclo (R$)"><input className="input" name="cost" inputMode="decimal" defaultValue={cur ? (cur.costCents / 100).toFixed(2).replace(".", ",") : ""} placeholder="49,90" /></Field>
          <Field label="Próximo lançamento" required><input className="input" type="date" name="nextDate" required defaultValue={cur ? cur.nextDate.slice(0, 10) : today()} /></Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name="notify" defaultChecked={cur?.notify ?? true} /> Avisar quando lançar</label>
          <p className="text-xs text-muted sm:col-span-2">Em cada vencimento o crédito entra sozinho no extrato. Se a data já passou, os ciclos atrasados são lançados de uma vez.</p>
        </form>
      </Modal>
    </section>
  );
}

export function Credentials({ accountId, saved, enabled }: { accountId: string; saved: string | null; enabled: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [shown, setShown] = useState<{ login: string; secret: string; notes: string | null } | null>(null);
  const [erro, setErro] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const r = await api(`/api/accounts/${accountId}/credential`, "PUT", { login: f.get("login"), secret: f.get("secret"), notes: f.get("notes") || null });
    if (!r.ok) return setErro(r.erro);
    setErro("");
    setEditing(false);
    setShown(null);
    toast("Credenciais salvas");
    refreshSafe(router);
  }
  async function reveal(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const r = await api<{ login: string; secret: string; notes: string | null }>(`/api/accounts/${accountId}/credential/reveal`, "POST", { password: new FormData(e.currentTarget).get("password") });
    if (!r.ok) return setErro(r.erro);
    setErro("");
    setRevealing(false);
    setShown(r.data);
    // Esconde de novo depois de 60s
    setTimeout(() => setShown(null), 60_000);
  }
  async function remove() {
    if (!(await confirmDialog({ title: "Excluir credenciais?", confirmLabel: "Excluir", danger: true }))) return;
    const r = await api(`/api/accounts/${accountId}/credential`, "DELETE");
    if (!r.ok) return toast(r.erro, "error");
    setShown(null);
    toast("Credenciais excluídas");
    refreshSafe(router);
  }
  async function copy(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast("Não foi possível copiar", "error");
    }
  }

  return (
    <section className="card card-pad mt-4">
      <Head icon={<KeyRound className="h-5 w-5" />} tone="bg-green-500/15 text-green-300" title="Credenciais de acesso" sub="Login e senha desta conta, criptografados" />
      {!enabled ? (
        <div className="rounded-xl bg-panel2/70 px-4 py-8 text-center text-sm text-muted">Recurso desativado neste servidor: o administrador precisa definir <code>CREDENTIALS_KEY</code>.</div>
      ) : !saved ? (
        <div className="flex flex-col items-center gap-2 rounded-xl bg-panel2/70 px-4 py-10 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-panel2 text-muted"><KeyRound className="h-5 w-5" /></span>
          <p className="text-sm text-zinc-300">Nenhuma credencial salva</p>
          <p className="text-xs text-muted">Armazene apenas com autorização do titular da conta.</p>
          <button className="btn-ghost mt-2" onClick={() => { setErro(""); setEditing(true); }}><Plus className="h-4 w-4" />Adicionar credenciais</button>
        </div>
      ) : (
        <div className="rounded-xl bg-panel2/70 p-4">
          {shown ? (
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              {[["Login", shown.login], ["Senha", shown.secret]].map(([l, v]) => (
                <div key={l} className="min-w-0">
                  <dt className="text-xs text-muted">{l}</dt>
                  <dd className="flex items-center gap-2"><code className="truncate">{v}</code><button className="btn-subtle h-7 w-7 px-0" onClick={() => copy(l!, v!)} aria-label={`Copiar ${l}`}>{copied === l ? <Check className="h-3.5 w-3.5 text-ok" /> : <Copy className="h-3.5 w-3.5" />}</button></dd>
                </div>
              ))}
              {shown.notes && <div className="sm:col-span-2"><dt className="text-xs text-muted">Observações</dt><dd>{shown.notes}</dd></div>}
            </dl>
          ) : (
            <p className="text-sm text-zinc-300">Credenciais salvas <span className="text-muted">· atualizadas em {fmtDate(saved)}</span></p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {!shown && <button className="btn-ghost h-8" onClick={() => { setErro(""); setRevealing(true); }}><Eye className="h-4 w-4" />Mostrar</button>}
            <button className="btn-ghost h-8" onClick={() => { setErro(""); setEditing(true); }}><Pencil className="h-4 w-4" />Alterar</button>
            <button className="btn-subtle h-8 text-red-300" onClick={remove}><Trash2 className="h-4 w-4" />Excluir</button>
          </div>
        </div>
      )}
      <Modal open={editing} onClose={() => setEditing(false)} title={saved ? "Alterar credenciais" : "Adicionar credenciais"} size="sm" footer={<><button className="btn-ghost" onClick={() => setEditing(false)}>Cancelar</button><button form="cred-form" className="btn-primary">Salvar</button></>}>
        <form id="cred-form" onSubmit={save} className="space-y-4" autoComplete="off">
          {erro && <Alert>{erro}</Alert>}
          <Alert kind="info">Guarde só com autorização do titular. Os dados ficam criptografados e cada visualização fica registrada.</Alert>
          <Field label="Login (CPF, e-mail ou número)" required><input className="input" name="login" required maxLength={200} autoComplete="off" /></Field>
          <Field label="Senha do programa" required><input className="input" name="secret" type="password" required maxLength={200} autoComplete="new-password" /></Field>
          <Field label="Observações"><input className="input" name="notes" maxLength={500} autoComplete="off" /></Field>
        </form>
      </Modal>
      <Modal open={revealing} onClose={() => setRevealing(false)} title="Confirme sua senha" size="sm" footer={<><button className="btn-ghost" onClick={() => setRevealing(false)}>Cancelar</button><button form="reveal-form" className="btn-primary">Mostrar</button></>}>
        <form id="reveal-form" onSubmit={reveal} className="space-y-4">
          {erro && <Alert>{erro}</Alert>}
          <p className="text-sm text-muted">Para ver as credenciais, digite a senha da sua conta no app.</p>
          <Field label="Sua senha" required><input className="input" name="password" type="password" required autoComplete="current-password" /></Field>
        </form>
      </Modal>
    </section>
  );
}
