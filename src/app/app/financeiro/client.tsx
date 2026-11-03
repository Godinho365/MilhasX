"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Pencil, Trash2, CircleCheck, Undo2, ArrowRightLeft, Repeat, Landmark } from "lucide-react";
import { api, today } from "@/lib/api";
import { useNav, refreshSafe } from "@/lib/nav";
import { fmtBRL, fmtDate, parseBRLToCents } from "@/lib/format";
import { Modal, Field, Alert, Empty } from "@/components/ui";
import { toast, confirmDialog } from "@/components/feedback";
import { categoryOptions, type FinType, type Regime } from "@/domain/finance";

type Account = { id: string; name: string; kind: string; color: string; archived: boolean; initialCents: number; balanceCents: number };
type Tx = { id: string; type: string; category: string | null; amountCents: number; description: string | null; counterpart: string | null; accountId: string; account: string; accountColor: string; toAccountId: string | null; toAccount: string | null; competence: string; dueDate: string; paidAt: string | null; repeat: boolean; overdue: boolean };

const TYPE_LABEL: Record<string, string> = { INCOME: "Receita", EXPENSE: "Despesa", TRANSFER: "Transferência" };
const KIND_LABEL: Record<string, string> = { BANK: "Conta bancária", CASH: "Caixa / dinheiro", WALLET: "Carteira digital", OTHER: "Outra" };
const COLORS = ["#60a5fa", "#22c55e", "#a78bfa", "#f59e0b", "#ef4444", "#f472b6", "#38bdf8", "#94a3b8"];
const money = (c: number) => (c / 100).toFixed(2).replace(".", ",");

/* ---------------- Lançamentos ---------------- */

export function TransactionsClient({ month, regime, items, accounts, filters }: { month: string; regime: Regime; items: Tx[]; accounts: Account[]; filters: { tipo: string; status: string } }) {
  const router = useRouter();
  const nav = useNav();
  const params = useSearchParams();
  const [editing, setEditing] = useState<Tx | FinType | null>(null);
  const go = (patch: Record<string, string>) => {
    const u = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) v ? u.set(k, v) : u.delete(k);
    nav(`/app/financeiro?${u}`);
  };
  const income = items.filter((t) => t.type === "INCOME").reduce((s, t) => s + t.amountCents, 0);
  const expense = items.filter((t) => t.type === "EXPENSE").reduce((s, t) => s + t.amountCents, 0);

  async function paid(t: Tx, value: boolean) {
    const r = await api(`/api/finance/transactions/${t.id}/paid`, "POST", { paid: value, date: value ? today() : undefined });
    if (!r.ok) return toast(r.erro, "error");
    toast(value ? (t.type === "INCOME" ? "Marcado como recebido" : "Marcado como pago") : "Voltou a pendente");
    refreshSafe(router);
  }
  async function remove(t: Tx) {
    if (!(await confirmDialog({ title: "Excluir lançamento?", body: `${t.description || t.category || TYPE_LABEL[t.type]} · ${fmtBRL(t.amountCents)}`, confirmLabel: "Excluir", danger: true }))) return;
    const r = await api(`/api/finance/transactions/${t.id}`, "DELETE");
    if (!r.ok) return toast(r.erro, "error");
    toast("Lançamento excluído");
    refreshSafe(router);
  }

  if (accounts.length === 0) {
    return (
      <Empty title="Cadastre uma conta primeiro" icon={<Landmark className="h-5 w-5" />}>
        <p className="max-w-sm text-sm text-muted">Os lançamentos saem e entram de uma conta (banco, caixa ou carteira digital).</p>
        <button className="btn-primary" onClick={() => nav("/app/financeiro?aba=contas")}>Ir para Contas</button>
      </Empty>
    );
  }
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex gap-1 rounded-xl border border-line bg-panel p-1" role="group" aria-label="Tipo">
          {[["", "Tudo"], ["INCOME", "Receitas"], ["EXPENSE", "Despesas"], ["TRANSFER", "Transferências"]].map(([k, l]) => (
            <button key={k} type="button" aria-pressed={filters.tipo === k} onClick={() => go({ tipo: k })} className={`rounded-lg px-2.5 py-1 text-xs font-medium ${filters.tipo === k ? "bg-panel2 text-white shadow-sm" : "text-muted hover:text-zinc-100"}`}>{l}</button>
          ))}
        </div>
        <div className="inline-flex gap-1 rounded-xl border border-line bg-panel p-1" role="group" aria-label="Situação">
          {[["", "Todos"], ["pago", "Realizados"], ["pendente", "Pendentes"]].map(([k, l]) => (
            <button key={k} type="button" aria-pressed={filters.status === k} onClick={() => go({ status: k })} className={`rounded-lg px-2.5 py-1 text-xs font-medium ${filters.status === k ? "bg-panel2 text-white shadow-sm" : "text-muted hover:text-zinc-100"}`}>{l}</button>
          ))}
        </div>
        <span className="flex-1" />
        <button className="btn-ghost" onClick={() => setEditing("INCOME")}><Plus className="h-4 w-4" />Receita</button>
        <button className="btn-ghost" onClick={() => setEditing("TRANSFER")}><ArrowRightLeft className="h-4 w-4" />Transferência</button>
        <button className="btn-primary" onClick={() => setEditing("EXPENSE")}><Plus className="h-4 w-4" />Despesa</button>
      </div>
      <div className="card overflow-hidden">
        {items.length === 0 ? <p className="px-5 py-12 text-center text-sm text-muted">Nenhum lançamento neste mês{regime === "competencia" ? " (competência)" : ""}.</p> : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead><tr><th>Situação</th><th>Data</th><th>Descrição</th><th>Categoria</th><th>Conta</th><th className="text-right">Valor</th><th className="w-28 text-right">Ações</th></tr></thead>
              <tbody>
                {items.map((t) => (
                  <tr key={t.id}>
                    <td>{t.paidAt ? <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-300">{t.type === "INCOME" ? "Recebido" : "Pago"}</span> : <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${t.overdue ? "bg-red-500/15 text-red-300" : "bg-amber-500/15 text-amber-300"}`}>{t.overdue ? "Atrasado" : "Pendente"}</span>}</td>
                    <td className="whitespace-nowrap tabular-nums">{fmtDate(t.paidAt ?? t.dueDate)}{regime === "competencia" && <span className="block text-xs text-muted">comp. {t.competence.slice(5, 7)}/{t.competence.slice(0, 4)}</span>}</td>
                    <td className="max-w-[260px]"><span className="flex items-center gap-1.5 truncate">{t.repeat && <Repeat className="h-3 w-3 shrink-0 text-muted" aria-label="Repete" />}{t.description || TYPE_LABEL[t.type]}</span>{t.counterpart && <span className="block truncate text-xs text-muted">{t.counterpart}</span>}</td>
                    <td className="max-w-[220px] truncate text-sm text-muted">{t.type === "TRANSFER" ? "Transferência" : t.category ?? "-"}</td>
                    <td className="whitespace-nowrap text-sm"><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.accountColor }} aria-hidden />{t.account}{t.toAccount && ` → ${t.toAccount}`}</span></td>
                    <td className={`text-right font-semibold tabular-nums ${t.type === "INCOME" ? "text-ok" : t.type === "EXPENSE" ? "text-bad" : ""}`}>{t.type === "EXPENSE" ? "−" : t.type === "INCOME" ? "+" : ""}{fmtBRL(t.amountCents)}</td>
                    <td className="text-right">
                      <div className="inline-flex gap-1">
                        {t.paidAt
                          ? <button className="btn-subtle h-8 w-8 px-0" onClick={() => paid(t, false)} aria-label={`Voltar a pendente: ${t.description ?? TYPE_LABEL[t.type]}`} title="Voltar a pendente"><Undo2 className="h-4 w-4" /></button>
                          : <button className="btn-subtle h-8 w-8 px-0 text-emerald-300" onClick={() => paid(t, true)} aria-label={`Marcar como ${t.type === "INCOME" ? "recebido" : "pago"}: ${t.description ?? TYPE_LABEL[t.type]}`} title={t.type === "INCOME" ? "Recebido hoje" : "Pago hoje"}><CircleCheck className="h-4 w-4" /></button>}
                        <button className="btn-subtle h-8 w-8 px-0" onClick={() => setEditing(t)} aria-label={`Editar ${t.description ?? TYPE_LABEL[t.type]}`}><Pencil className="h-4 w-4" /></button>
                        <button className="btn-subtle h-8 w-8 px-0" onClick={() => remove(t)} aria-label={`Excluir ${t.description ?? TYPE_LABEL[t.type]}`}><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {items.length > 0 && <p className="mt-2 text-right text-sm text-muted">Receitas <span className="tabular-nums text-emerald-300">{fmtBRL(income)}</span> · Despesas <span className="tabular-nums text-red-300">{fmtBRL(expense)}</span> · Saldo <span className="tabular-nums font-semibold text-white">{fmtBRL(income - expense)}</span></p>}
      {editing && <TxDialog tx={typeof editing === "string" ? null : editing} type={typeof editing === "string" ? editing : (editing.type as FinType)} month={month} accounts={accounts} onClose={() => setEditing(null)} />}
    </>
  );
}

function TxDialog({ tx, type: initialType, month, accounts, onClose }: { tx: Tx | null; type: FinType; month: string; accounts: Account[]; onClose: () => void }) {
  const router = useRouter();
  const t0 = today();
  const defDay = t0.slice(0, 7) === month ? t0 : `${month}-01`;
  const [type, setType] = useState<FinType>(initialType);
  const [f, setF] = useState({
    accountId: tx?.accountId ?? accounts[0]?.id ?? "",
    toAccountId: tx?.toAccountId ?? accounts.find((a) => a.id !== (tx?.accountId ?? accounts[0]?.id))?.id ?? "",
    category: tx?.category ?? "",
    amount: tx ? money(tx.amountCents) : "",
    description: tx?.description ?? "",
    counterpart: tx?.counterpart ?? "",
    dueDate: tx?.dueDate ?? defDay,
    competence: tx?.competence ?? defDay,
    paid: tx ? !!tx.paidAt : false,
    repeat: "1",
  });
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof f>) => setF({ ...f, ...p });
  const cats = type === "TRANSFER" ? [] : categoryOptions(type);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const amountCents = parseBRLToCents(f.amount);
    if (!amountCents || amountCents <= 0) return setErro("Informe o valor");
    setBusy(true);
    const body = {
      type, accountId: f.accountId, toAccountId: type === "TRANSFER" ? f.toAccountId : null, category: type === "TRANSFER" ? null : f.category || null,
      amountCents, description: f.description || null, counterpart: f.counterpart || null, dueDate: f.dueDate, competence: f.competence, paid: f.paid,
      ...(tx ? {} : { repeatMonths: Number(f.repeat) || 1 }),
    };
    const r = tx ? await api(`/api/finance/transactions/${tx.id}`, "PUT", body) : await api<{ created: number }>("/api/finance/transactions", "POST", body);
    setBusy(false);
    if (!r.ok) return setErro(r.erro);
    toast(tx ? "Lançamento atualizado" : Number(f.repeat) > 1 ? `${f.repeat} lançamentos criados` : "Lançamento criado");
    onClose();
    refreshSafe(router);
  }

  return (
    <Modal open onClose={onClose} title={tx ? "Editar lançamento" : `Nova ${TYPE_LABEL[type]!.toLowerCase()}`}
      footer={<><button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button form="fin-form" className="btn-primary" disabled={busy}>Salvar</button></>}>
      <form id="fin-form" onSubmit={save} className="space-y-4">
        {erro && <Alert>{erro}</Alert>}
        <div className="inline-flex gap-1 rounded-xl border border-line bg-panel p-1" role="group" aria-label="Tipo do lançamento">
          {(["INCOME", "EXPENSE", "TRANSFER"] as const).map((k) => <button key={k} type="button" aria-pressed={type === k} onClick={() => { setType(k); set({ category: "" }); }} className={`rounded-lg px-3 py-1 text-sm font-medium ${type === k ? "bg-panel2 text-white shadow-sm" : "text-muted hover:text-zinc-100"}`}>{TYPE_LABEL[k]}</button>)}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Valor (R$)" required><input className="input" inputMode="decimal" value={f.amount} onChange={(e) => set({ amount: e.target.value })} placeholder="0,00" aria-label="Valor" autoFocus /></Field>
          <Field label={type === "TRANSFER" ? "Da conta" : "Conta"} required>
            <select className="input" value={f.accountId} onChange={(e) => set({ accountId: e.target.value })} aria-label="Conta">{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          </Field>
          {type === "TRANSFER" ? (
            <Field label="Para a conta" required>
              <select className="input" value={f.toAccountId} onChange={(e) => set({ toAccountId: e.target.value })} aria-label="Conta de destino">{accounts.filter((a) => a.id !== f.accountId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
            </Field>
          ) : (
            <Field label="Categoria">
              <select className="input" value={f.category} onChange={(e) => set({ category: e.target.value })} aria-label="Categoria">
                <option value="">Sem categoria</option>
                {cats.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          )}
          <Field label={type === "INCOME" ? "Cliente (opcional)" : "Fornecedor (opcional)"}><input className="input" value={f.counterpart} onChange={(e) => set({ counterpart: e.target.value })} maxLength={120} aria-label="Fornecedor ou cliente" /></Field>
          <Field label="Descrição" className="sm:col-span-2"><input className="input" value={f.description} onChange={(e) => set({ description: e.target.value })} maxLength={200} placeholder="Ex.: Aluguel do escritório" aria-label="Descrição" /></Field>
          <Field label={type === "INCOME" ? "Data do recebimento" : "Data do pagamento"} required hint="Vencimento, se ainda não foi pago"><input className="input" type="date" value={f.dueDate} onChange={(e) => set({ dueDate: e.target.value })} required aria-label="Data do pagamento" /></Field>
          <Field label="Competência" required hint="Mês a que pertence"><input className="input" type="date" value={f.competence} onChange={(e) => set({ competence: e.target.value })} required aria-label="Competência" /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.paid} onChange={(e) => set({ paid: e.target.checked })} />{type === "INCOME" ? "Já recebido" : type === "EXPENSE" ? "Já pago" : "Já transferido"}<span className="text-xs text-muted">(pendente não mexe no saldo)</span></label>
        {!tx && (
          <Field label="Repetir" hint="Cria um lançamento por mês; os seguintes entram pendentes">
            <select className="input" value={f.repeat} onChange={(e) => set({ repeat: e.target.value })} aria-label="Repetir">
              <option value="1">Não repetir</option>
              {[2, 3, 6, 12, 24, 36].map((n) => <option key={n} value={n}>{n} meses</option>)}
            </select>
          </Field>
        )}
      </form>
    </Modal>
  );
}

/* ---------------- Contas ---------------- */

export function AccountsClient({ accounts }: { accounts: Account[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Account | "new" | null>(null);
  async function remove(a: Account) {
    if (!(await confirmDialog({ title: `Excluir a conta "${a.name}"?`, body: "Se ela já tiver lançamentos, fica arquivada e o histórico continua.", confirmLabel: "Excluir", danger: true }))) return;
    const r = await api<{ result: string }>(`/api/finance/accounts/${a.id}`, "DELETE");
    if (!r.ok) return toast(r.erro, "error");
    toast(r.data.result === "archived" ? "Conta arquivada (tinha lançamentos)" : "Conta excluída");
    refreshSafe(router);
  }
  const active = accounts.filter((a) => !a.archived);
  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="flex-1 font-semibold">Suas contas <span className="text-muted">({active.length})</span></h2>
        <button className="btn-primary" onClick={() => setEditing("new")}><Plus className="h-4 w-4" />Nova conta</button>
      </div>
      {accounts.length === 0 ? (
        <Empty title="Nenhuma conta cadastrada" icon={<Landmark className="h-5 w-5" />}>
          <p className="max-w-sm text-sm text-muted">Cadastre suas contas (banco, caixa, carteira digital) com o saldo de hoje para acompanhar receitas, despesas e o saldo de cada uma.</p>
          <button className="btn-primary" onClick={() => setEditing("new")}>Criar primeira conta</button>
        </Empty>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((a) => (
            <li key={a.id} className={`card card-pad ${a.archived ? "opacity-50" : ""}`}>
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: a.color }} aria-hidden />
                <p className="flex-1 truncate font-semibold">{a.name}</p>
                {!a.archived && <button className="btn-subtle h-8 w-8 px-0" onClick={() => setEditing(a)} aria-label={`Editar ${a.name}`}><Pencil className="h-4 w-4" /></button>}
                {!a.archived && <button className="btn-subtle h-8 w-8 px-0" onClick={() => remove(a)} aria-label={`Excluir ${a.name}`}><Trash2 className="h-4 w-4" /></button>}
              </div>
              <p className="text-xs text-muted">{KIND_LABEL[a.kind] ?? a.kind}{a.archived ? " · arquivada" : ""}</p>
              <p className={`mt-3 text-2xl font-semibold tabular-nums ${a.balanceCents < 0 ? "text-red-400" : ""}`}>{fmtBRL(a.balanceCents)}</p>
              <p className="text-xs text-muted">saldo inicial {fmtBRL(a.initialCents)}</p>
            </li>
          ))}
        </ul>
      )}
      {editing && <AccountDialog account={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function AccountDialog({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const router = useRouter();
  const [f, setF] = useState({ name: account?.name ?? "", kind: account?.kind ?? "BANK", initial: account ? money(account.initialCents) : "", color: account?.color ?? COLORS[0]! });
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const initialCents = f.initial.trim() ? parseBRLToCents(f.initial.replace(/^-/, "")) : 0;
    if (initialCents == null) return setErro("Saldo inicial inválido");
    setBusy(true);
    const body = { name: f.name, kind: f.kind, initialCents: f.initial.trim().startsWith("-") ? -initialCents : initialCents, color: f.color };
    const r = account ? await api(`/api/finance/accounts/${account.id}`, "PUT", body) : await api("/api/finance/accounts", "POST", body);
    setBusy(false);
    if (!r.ok) return setErro(r.erro);
    toast(account ? "Conta atualizada" : "Conta criada");
    onClose();
    refreshSafe(router);
  }
  return (
    <Modal open onClose={onClose} title={account ? "Editar conta" : "Nova conta"} size="sm"
      footer={<><button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button form="acc-form" className="btn-primary" disabled={busy}>Salvar</button></>}>
      <form id="acc-form" onSubmit={save} className="space-y-3">
        {erro && <Alert>{erro}</Alert>}
        <Field label="Nome" required><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={60} placeholder="Ex.: Nubank PJ" required aria-label="Nome da conta" autoFocus /></Field>
        <Field label="Tipo"><select className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} aria-label="Tipo de conta">{Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Saldo inicial (R$)" hint="O saldo de hoje; negativo com o sinal de menos"><input className="input" inputMode="decimal" value={f.initial} onChange={(e) => setF({ ...f, initial: e.target.value })} placeholder="0,00" aria-label="Saldo inicial" /></Field>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Cor">
          {COLORS.map((c) => <button key={c} type="button" onClick={() => setF({ ...f, color: c })} aria-label={`Cor ${c}`} aria-pressed={f.color === c} className={`h-6 w-6 rounded-full ring-offset-2 ring-offset-panel ${f.color === c ? "ring-2 ring-white" : ""}`} style={{ backgroundColor: c }} />)}
        </div>
      </form>
    </Modal>
  );
}
